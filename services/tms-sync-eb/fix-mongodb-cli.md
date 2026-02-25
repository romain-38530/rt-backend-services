# 🔧 Fix Commandes 11/02 - Via MongoDB CLI

## 📋 Connexion MongoDB

```bash
# Installer mongosh si nécessaire
# https://www.mongodb.com/try/download/shell

# Se connecter à MongoDB Atlas
mongosh "mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"
```

---

## 🔍 Diagnostic

### 1. Vérifier les commandes du 11/02

```javascript
// Utiliser la base de données
use rt-tms-sync

// Compter les commandes du 11/02
db.orders.countDocuments({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  }
})

// Voir une commande exemple
db.orders.findOne({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  }
})

// Compter combien n'ont PAS assignedCarrier
db.orders.countDocuments({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  },
  assignedCarrier: { $exists: false }
})
```

### 2. Vérifier les données Dashdoc Data Lake

```javascript
// Vérifier les transports Dashdoc du 11/02
db.dashdoctransports.countDocuments({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  }
})

// Voir un exemple avec assignedCarrier
db.dashdoctransports.findOne({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z")
  },
  assignedCarrier: { $exists: true }
})
```

---

## ✅ Correction Directe (Option Rapide)

### Mettre à jour TOUTES les commandes du 11/02

⚠️ **BACKUP D'ABORD**:
```javascript
// Créer une copie de sauvegarde
db.orders.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-02-11T00:00:00.000Z"),
        $lt: ISODate("2026-02-16T00:00:00.000Z")
      }
    }
  },
  { $out: "orders_backup_20260211" }
])
```

### Mise à jour depuis Data Lake

```javascript
// Pour chaque commande du 11/02, récupérer assignedCarrier depuis Data Lake
db.orders.find({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  },
  "metadata.dashdocTransportUid": { $exists: true }
}).forEach(function(order) {
  // Chercher le transport Dashdoc correspondant
  var transport = db.dashdoctransports.findOne({
    uid: order.metadata.dashdocTransportUid
  });

  if (transport && transport.assignedCarrier) {
    // Mettre à jour la commande avec assignedCarrier
    db.orders.updateOne(
      { _id: order._id },
      {
        $set: {
          assignedCarrier: transport.assignedCarrier,
          "metadata.lastSyncDate": new Date(),
          updatedAt: new Date()
        }
      }
    );
    print("✅ Updated order: " + order._id);
  } else {
    print("⚠️  No transport found for order: " + order._id);
  }
});

print("\n🎉 Mise à jour terminée!");
```

---

## 🔍 Vérification Après Correction

```javascript
// Compter combien de commandes ont maintenant assignedCarrier
db.orders.countDocuments({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  },
  assignedCarrier: { $exists: true }
})

// Voir un exemple mis à jour
db.orders.findOne({
  createdAt: {
    $gte: ISODate("2026-02-11T00:00:00.000Z"),
    $lt: ISODate("2026-02-16T00:00:00.000Z")
  },
  assignedCarrier: { $exists: true }
}, {
  assignedCarrier: 1,
  "metadata.dashdocTransportUid": 1,
  createdAt: 1
})
```

---

## 📊 Requêtes Utiles

### Voir toutes les commandes sans assignedCarrier

```javascript
db.orders.find({
  createdAt: { $gte: ISODate("2026-02-11T00:00:00.000Z") },
  assignedCarrier: { $exists: false }
}).limit(10).forEach(function(doc) {
  print("Order ID: " + doc._id + " | Dashdoc UID: " + doc.metadata.dashdocTransportUid);
});
```

### Statistiques par date

```javascript
db.orders.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-02-11T00:00:00.000Z"),
        $lt: ISODate("2026-02-16T00:00:00.000Z")
      }
    }
  },
  {
    $group: {
      _id: {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
      },
      total: { $sum: 1 },
      withCarrier: {
        $sum: { $cond: [{ $ifNull: ["$assignedCarrier", false] }, 1, 0] }
      }
    }
  },
  { $sort: { _id: 1 } }
])
```

---

## 🚨 Rollback Si Problème

```javascript
// Restaurer depuis le backup
db.orders_backup_20260211.find().forEach(function(doc) {
  db.orders.replaceOne({ _id: doc._id }, doc);
});

// Supprimer le backup après vérification
db.orders_backup_20260211.drop()
```

---

## 💡 Commandes Rapides

```javascript
// Connexion rapide
mongosh "mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"

// Diagnostic 1-liner
use rt-tms-sync; db.orders.countDocuments({createdAt:{$gte:ISODate("2026-02-11"),$lt:ISODate("2026-02-16")}, assignedCarrier:{$exists:false}})

// Fix 1-liner (après backup!)
use rt-tms-sync; db.orders.find({createdAt:{$gte:ISODate("2026-02-11"),$lt:ISODate("2026-02-16")},"metadata.dashdocTransportUid":{$exists:true}}).forEach(function(o){var t=db.dashdoctransports.findOne({uid:o.metadata.dashdocTransportUid});if(t&&t.assignedCarrier)db.orders.updateOne({_id:o._id},{$set:{assignedCarrier:t.assignedCarrier,updatedAt:new Date()}})})
```

---

**Avantage MongoDB CLI**: Correction immédiate sans attendre MongoDB Atlas IP whitelist! 🚀
