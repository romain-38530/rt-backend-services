#!/usr/bin/env python3
"""
Script de configuration de la connexion Dashdoc
Usage: python setup-dashdoc-connection.py
"""

import sys
from datetime import datetime

try:
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo is not installed")
    print("\nInstallation:")
    print("  pip install pymongo")
    sys.exit(1)

MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"
DASHDOC_TOKEN = "8321c7a8f7fe8f75192fa15a6c883a11758e0084"

def setup_connection():
    try:
        print("🔄 Connexion à MongoDB...")
        client = MongoClient(MONGODB_URI)

        # Test de connexion
        client.admin.command('ping')
        print("✅ Connecté à MongoDB\n")

        db = client['rt-tms-sync']
        collection = db['tmsConnections']

        # Vérifier si une connexion existe
        print("🔍 Recherche d'une connexion Dashdoc existante...")
        existing = collection.find_one({"tmsType": "dashdoc"})

        if existing:
            print("⚠️  Une connexion Dashdoc existe déjà:")
            print(f"   - ID: {existing['_id']}")
            print(f"   - Organisation: {existing.get('organizationName', 'N/A')}")
            print(f"   - Status: {'✅ Active' if existing.get('isActive') else '❌ Inactive'}")
            print(f"   - Connection: {existing.get('connectionStatus', 'unknown')}")
            print(f"   - API URL: {existing.get('credentials', {}).get('apiUrl', 'N/A')}")

            # Mettre à jour
            print("\n🔄 Mise à jour du token API...")
            collection.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "credentials.apiToken": DASHDOC_TOKEN,
                        "credentials.apiUrl": "https://www.dashdoc.eu/api/v4",
                        "isActive": True,
                        "connectionStatus": "connected",
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
            print("✅ Token API mis à jour")
            connection_id = existing["_id"]

        else:
            print("📝 Aucune connexion trouvée, création d'une nouvelle...\n")

            new_connection = {
                "tmsType": "dashdoc",
                "organizationName": "SYMPHONIA",
                "isActive": True,
                "connectionStatus": "connected",
                "credentials": {
                    "apiToken": DASHDOC_TOKEN,
                    "apiUrl": "https://www.dashdoc.eu/api/v4"
                },
                "syncConfig": {
                    "autoSync": True,
                    "transportLimit": 0,
                    "companyLimit": 0,
                    "contactLimit": 0,
                    "maxPages": 100
                },
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = collection.insert_one(new_connection)
            print(f"✅ Nouvelle connexion créée avec ID: {result.inserted_id}")
            connection_id = result.inserted_id

        # Afficher la configuration finale
        print("\n" + "="*60)
        print("📊 CONFIGURATION FINALE")
        print("="*60)

        final = collection.find_one({"tmsType": "dashdoc"})
        print(f"ID:           {final['_id']}")
        print(f"Organisation: {final['organizationName']}")
        print(f"Active:       {'✅ Oui' if final['isActive'] else '❌ Non'}")
        print(f"API URL:      {final['credentials']['apiUrl']}")
        print(f"Token:        {final['credentials']['apiToken'][:20]}...")
        print(f"Auto-sync:    {'✅ Activé' if final['syncConfig']['autoSync'] else '❌ Désactivé'}")
        print(f"Max pages:    {final['syncConfig']['maxPages']}")

        print("\n" + "="*60)
        print("✅ CONFIGURATION TERMINÉE AVEC SUCCÈS!")
        print("="*60)

        print("\n📋 PROCHAINES ÉTAPES:")
        print("   1. Le job carriersSync s'exécutera automatiquement dans ~5 minutes")
        print("   2. Ou lancez-le manuellement maintenant:")
        print("      curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/carriersSync/run")
        print("\n   3. Attendez 15-20 minutes pour la synchronisation complète")
        print("\n   4. Vérifiez le résultat:")
        print("      curl http://rt-tms-sync-api-v2.../api/v1/tms/carriers | jq .total")
        print("      (Résultat attendu: ~1365 carriers)")

        client.close()

    except Exception as e:
        print(f"❌ Erreur: {e}")
        sys.exit(1)

if __name__ == "__main__":
    setup_connection()
