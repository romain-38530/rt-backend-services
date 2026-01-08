/**
 * Billing Service
 * Génération automatique préfactures et rappels
 */

import { ObjectId } from 'mongodb';

/**
 * Générer les préfactures mensuelles
 * Appelé le 1er de chaque mois à 2h
 */
export async function generateMonthlyPrefactures(db) {
  console.log('[BILLING-SERVICE] Génération préfactures mensuelles...');

  try {
    // Mois précédent
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Dernier jour mois précédent
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

    console.log(`[BILLING-SERVICE] Période: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

    // Récupérer tous les logisticiens actifs avec options de préfacturation
    const logisticians = await db.collection('logisticians')
      .find({
        status: 'active',
        'billing.autoPrefacture': true
      })
      .toArray();

    console.log(`[BILLING-SERVICE] ${logisticians.length} logisticiens avec préfacturation auto`);

    let prefacturesCreated = 0;

    for (const logistician of logisticians) {
      try {
        // Récupérer les opérations du mois groupées par industriel
        const operations = await db.collection('operations')
          .aggregate([
            {
              $match: {
                logisticianId: logistician._id,
                completedAt: { $gte: periodStart, $lte: periodEnd },
                status: 'completed',
                invoiced: { $ne: true }
              }
            },
            {
              $group: {
                _id: '$industryId',
                operations: { $push: '$$ROOT' },
                totalOperations: { $sum: 1 }
              }
            }
          ])
          .toArray();

        for (const group of operations) {
          if (!group._id) continue;

          // Récupérer industriel
          const industry = await db.collection('industries').findOne({
            _id: group._id
          });

          if (!industry) continue;

          // Récupérer tarifs contractuels
          const contract = await db.collection('logistician_contracts').findOne({
            logisticianId: logistician._id,
            industryId: group._id,
            status: 'active'
          });

          // Construire lignes de préfacture
          const lines = [];

          // Grouper par type d'opération
          const operationsByType = {};
          for (const op of group.operations) {
            const type = op.operationType || 'autre';
            if (!operationsByType[type]) {
              operationsByType[type] = [];
            }
            operationsByType[type].push(op);
          }

          for (const [type, ops] of Object.entries(operationsByType)) {
            const unitPrice = getOperationPrice(type, contract);
            const quantity = ops.length;

            lines.push({
              description: getOperationDescription(type),
              quantity,
              unit: 'opération',
              unitPrice,
              vatRate: 20,
              amountHT: quantity * unitPrice,
              amountTTC: (quantity * unitPrice) * 1.2,
              operationIds: ops.map(o => o._id)
            });
          }

          // Ajouter frais de manutention si applicable
          const totalVolume = group.operations.reduce((sum, op) => sum + (op.volume || 0), 0);
          if (totalVolume > 0 && contract?.handlingFeePerM3) {
            lines.push({
              description: 'Frais de manutention',
              quantity: Math.round(totalVolume * 10) / 10,
              unit: 'm³',
              unitPrice: contract.handlingFeePerM3,
              vatRate: 20,
              amountHT: totalVolume * contract.handlingFeePerM3,
              amountTTC: (totalVolume * contract.handlingFeePerM3) * 1.2
            });
          }

          // Ajouter frais de stockage si applicable
          const storageDays = await calculateStorageDays(db, logistician._id, group._id, periodStart, periodEnd);
          if (storageDays > 0 && contract?.storageFeePerM3PerDay) {
            lines.push({
              description: 'Frais de stockage',
              quantity: storageDays,
              unit: 'jour.m³',
              unitPrice: contract.storageFeePerM3PerDay,
              vatRate: 20,
              amountHT: storageDays * contract.storageFeePerM3PerDay,
              amountTTC: (storageDays * contract.storageFeePerM3PerDay) * 1.2
            });
          }

          if (lines.length === 0) continue;

          // Calculer totaux
          const totalHT = lines.reduce((sum, l) => sum + l.amountHT, 0);
          const totalTVA = lines.reduce((sum, l) => sum + (l.amountHT * l.vatRate / 100), 0);
          const totalTTC = totalHT + totalTVA;

          // Générer numéro préfacture
          const count = await db.collection('logistician_prefactures').countDocuments({
            logisticianId: logistician._id
          });

          const prefactureNumber = `PRE-${logistician._id.toString().slice(-4)}-${String(count + 1).padStart(5, '0')}`;

          // Créer préfacture
          const prefacture = {
            prefactureNumber,
            logisticianId: logistician._id,
            industryId: group._id,
            periodStart,
            periodEnd,
            lines,
            totalHT: Math.round(totalHT * 100) / 100,
            totalTVA: Math.round(totalTVA * 100) / 100,
            totalTTC: Math.round(totalTTC * 100) / 100,
            status: 'draft',
            autoGenerated: true,
            createdAt: new Date()
          };

          await db.collection('logistician_prefactures').insertOne(prefacture);
          prefacturesCreated++;

          // Marquer opérations comme incluses
          const operationIds = group.operations.map(o => o._id);
          await db.collection('operations').updateMany(
            { _id: { $in: operationIds } },
            { $set: { prefactured: true, prefactureNumber } }
          );

          // Log événement
          await db.collection('logistician_events').insertOne({
            type: 'prefacture.auto_generated',
            logisticianId: logistician._id,
            data: {
              prefactureNumber,
              industryId: group._id,
              industryName: industry.companyName,
              totalTTC,
              operationsCount: group.operations.length
            },
            createdAt: new Date()
          });

          console.log(`[BILLING-SERVICE] Préfacture ${prefactureNumber} créée: ${totalTTC}€ TTC`);
        }

      } catch (error) {
        console.error(`[BILLING-SERVICE] Erreur logisticien ${logistician._id}:`, error.message);
      }
    }

    console.log(`[BILLING-SERVICE] Terminé: ${prefacturesCreated} préfactures créées`);

    return { prefacturesCreated };

  } catch (error) {
    console.error('[BILLING-SERVICE] Erreur génération préfactures:', error.message);
    throw error;
  }
}

/**
 * Vérifier les rappels de factures
 * Appelé tous les jours à 9h
 */
export async function checkInvoiceReminders(db) {
  console.log('[BILLING-SERVICE] Vérification rappels factures...');

  try {
    const now = new Date();
    const reminderThresholds = [7, 14, 30]; // jours avant/après échéance

    // Factures en attente
    const pendingInvoices = await db.collection('logistician_invoices')
      .find({
        status: 'pending'
      })
      .toArray();

    console.log(`[BILLING-SERVICE] ${pendingInvoices.length} factures en attente`);

    let remindersCount = 0;
    let overdueCount = 0;

    for (const invoice of pendingInvoices) {
      const dueDate = new Date(invoice.dueDate);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      // Facture en retard
      if (daysUntilDue < 0) {
        // Marquer comme overdue si pas déjà fait
        if (invoice.status !== 'overdue') {
          await db.collection('logistician_invoices').updateOne(
            { _id: invoice._id },
            { $set: { status: 'overdue', overdueAt: new Date() } }
          );

          // Log événement
          await db.collection('logistician_events').insertOne({
            type: 'invoice.overdue',
            logisticianId: invoice.issuerId,
            data: {
              invoiceId: invoice._id,
              invoiceNumber: invoice.invoiceNumber,
              daysOverdue: Math.abs(daysUntilDue),
              totalTTC: invoice.totalTTC
            },
            createdAt: new Date()
          });

          overdueCount++;
        }

        // Envoyer rappel si seuil atteint
        const daysOverdue = Math.abs(daysUntilDue);
        const lastReminder = invoice.lastReminderAt ? new Date(invoice.lastReminderAt) : null;
        const daysSinceReminder = lastReminder
          ? Math.ceil((now - lastReminder) / (1000 * 60 * 60 * 24))
          : 999;

        // Rappel tous les 7 jours en retard
        if (daysOverdue > 0 && (daysOverdue === 7 || daysOverdue === 14 || daysOverdue === 30) && daysSinceReminder >= 7) {
          await sendInvoiceReminder(db, invoice, 'overdue', daysOverdue);
          remindersCount++;
        }
      }
      // Rappel avant échéance
      else if (daysUntilDue === 7 || daysUntilDue === 3) {
        const lastReminder = invoice.lastReminderAt ? new Date(invoice.lastReminderAt) : null;
        const daysSinceReminder = lastReminder
          ? Math.ceil((now - lastReminder) / (1000 * 60 * 60 * 24))
          : 999;

        if (daysSinceReminder >= 3) {
          await sendInvoiceReminder(db, invoice, 'upcoming', daysUntilDue);
          remindersCount++;
        }
      }
    }

    console.log(`[BILLING-SERVICE] Terminé: ${remindersCount} rappels, ${overdueCount} factures marquées overdue`);

    return { remindersCount, overdueCount };

  } catch (error) {
    console.error('[BILLING-SERVICE] Erreur vérification rappels:', error.message);
    throw error;
  }
}

/**
 * Envoyer un rappel de facture
 */
async function sendInvoiceReminder(db, invoice, type, days) {
  try {
    // Récupérer destinataire
    let recipientEmail = null;
    if (invoice.recipientId) {
      const recipient = await db.collection('industries').findOne({ _id: invoice.recipientId });
      recipientEmail = recipient?.billingEmail || recipient?.email;
    }

    // Log rappel
    await db.collection('invoice_reminders').insertOne({
      invoiceId: invoice._id,
      type,
      days,
      recipientEmail,
      sentAt: new Date()
    });

    // Mettre à jour facture
    await db.collection('logistician_invoices').updateOne(
      { _id: invoice._id },
      {
        $set: { lastReminderAt: new Date() },
        $inc: { reminderCount: 1 }
      }
    );

    // Log événement
    await db.collection('logistician_events').insertOne({
      type: 'invoice.reminder_sent',
      logisticianId: invoice.issuerId,
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        reminderType: type,
        days
      },
      createdAt: new Date()
    });

    // TODO: Implémenter envoi email réel
    console.log(`[BILLING-SERVICE] Rappel envoyé: ${invoice.invoiceNumber} (${type}, ${days} jours)`);

  } catch (error) {
    console.error('[BILLING-SERVICE] Erreur envoi rappel:', error.message);
  }
}

/**
 * Obtenir le prix d'une opération selon le contrat
 */
function getOperationPrice(type, contract) {
  if (contract?.prices?.[type]) {
    return contract.prices[type];
  }

  // Prix par défaut
  const defaultPrices = {
    reception: 25,
    expedition: 25,
    preparation: 15,
    manutention: 20,
    autre: 20
  };

  return defaultPrices[type] || 20;
}

/**
 * Obtenir la description d'un type d'opération
 */
function getOperationDescription(type) {
  const descriptions = {
    reception: 'Réception marchandise',
    expedition: 'Expédition marchandise',
    preparation: 'Préparation commande',
    manutention: 'Manutention',
    stockage: 'Stockage',
    autre: 'Opération diverse'
  };

  return descriptions[type] || 'Opération logistique';
}

/**
 * Calculer les jours de stockage pour un industriel
 */
async function calculateStorageDays(db, logisticianId, industryId, periodStart, periodEnd) {
  try {
    // Récupérer les mouvements de stock
    const stockMovements = await db.collection('stock_movements')
      .find({
        logisticianId,
        industryId,
        date: { $gte: periodStart, $lte: periodEnd }
      })
      .sort({ date: 1 })
      .toArray();

    // Calcul simplifié: somme des volumes x jours
    // En production, utiliser une méthode plus précise
    let totalStorageDays = 0;

    for (let i = 0; i < stockMovements.length - 1; i++) {
      const current = stockMovements[i];
      const next = stockMovements[i + 1];
      const days = Math.ceil((new Date(next.date) - new Date(current.date)) / (1000 * 60 * 60 * 24));
      totalStorageDays += (current.volume || 0) * days;
    }

    return totalStorageDays;

  } catch (error) {
    console.error('[BILLING-SERVICE] Erreur calcul stockage:', error.message);
    return 0;
  }
}

/**
 * Générer un rapport de facturation mensuel
 */
export async function generateBillingReport(db, logisticianId, year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Factures du mois
    const invoices = await db.collection('logistician_invoices')
      .find({
        issuerId: new ObjectId(logisticianId),
        issueDate: { $gte: startDate, $lte: endDate }
      })
      .toArray();

    // Paiements reçus
    const payments = await db.collection('invoice_payments')
      .find({
        logisticianId: new ObjectId(logisticianId),
        paidAt: { $gte: startDate, $lte: endDate }
      })
      .toArray();

    // Calculs
    const report = {
      period: {
        year,
        month,
        startDate,
        endDate
      },
      invoices: {
        count: invoices.length,
        totalHT: invoices.reduce((sum, i) => sum + (i.totalHT || 0), 0),
        totalTTC: invoices.reduce((sum, i) => sum + (i.totalTTC || 0), 0),
        byStatus: {
          paid: invoices.filter(i => i.status === 'paid').length,
          pending: invoices.filter(i => i.status === 'pending').length,
          overdue: invoices.filter(i => i.status === 'overdue').length
        }
      },
      payments: {
        count: payments.length,
        total: payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      },
      balance: {
        invoiced: invoices.reduce((sum, i) => sum + (i.totalTTC || 0), 0),
        received: payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      }
    };

    report.balance.outstanding = report.balance.invoiced - report.balance.received;

    return report;

  } catch (error) {
    console.error('[BILLING-SERVICE] Erreur génération rapport:', error.message);
    throw error;
  }
}
