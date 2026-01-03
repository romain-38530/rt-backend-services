/**
 * Driving Time Service - Temps de Conduite et Repos
 * SYMPHONI.A - RT Technologie
 *
 * Conformité réglementaire européenne:
 * - Règlement (CE) 561/2006 - Temps de conduite et repos
 * - Directive 2002/15/CE - Temps de travail
 * - Tachygraphe numérique
 *
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');

// ============================================
// CONFIGURATION RÉGLEMENTAIRE
// ============================================

const DRIVING_REGULATIONS = {
  // Règlement (CE) 561/2006
  EU_561_2006: {
    // Temps de conduite
    driving: {
      // Durée maximale de conduite continue (minutes)
      maxContinuous: 4.5 * 60, // 4h30

      // Durée maximale journalière (minutes)
      maxDaily: 9 * 60, // 9h (peut être étendu à 10h 2x/semaine)
      maxDailyExtended: 10 * 60, // 10h

      // Nombre d'extensions journalières autorisées par semaine
      maxDailyExtensionsPerWeek: 2,

      // Durée maximale hebdomadaire (minutes)
      maxWeekly: 56 * 60, // 56h

      // Durée maximale sur 2 semaines (minutes)
      maxBiWeekly: 90 * 60 // 90h
    },

    // Temps de repos
    breaks: {
      // Pause obligatoire après conduite continue (minutes)
      requiredBreak: 45, // 45 min

      // Possibilité de fractionner en 15+30
      splitBreak: [15, 30],

      // Repos journalier normal (heures)
      dailyRestNormal: 11,

      // Repos journalier réduit (heures)
      dailyRestReduced: 9,

      // Nombre de repos réduits par semaine
      maxReducedDailyRestPerWeek: 3,

      // Repos hebdomadaire normal (heures)
      weeklyRestNormal: 45,

      // Repos hebdomadaire réduit (heures)
      weeklyRestReduced: 24,

      // Compensation repos réduit
      weeklyRestCompensation: true
    },

    // Périodes
    periods: {
      // Durée d'une journée de travail (heures)
      workDay: 24,

      // Durée d'une semaine (heures)
      workWeek: 168, // 24 * 7

      // Début semaine (jour de la semaine, 0 = dimanche)
      weekStartDay: 1 // Lundi
    }
  }
};

// Statuts d'activité du conducteur
const DriverActivity = {
  DRIVING: 'driving',
  OTHER_WORK: 'other_work',
  AVAILABILITY: 'availability',
  REST: 'rest',
  BREAK: 'break'
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service de gestion du temps de conduite
 * @param {MongoClient} mongoClient
 * @returns {Object} Service
 */
function createDrivingTimeService(mongoClient) {
  const getDb = () => mongoClient.db();
  const regulations = DRIVING_REGULATIONS.EU_561_2006;

  // ============================================
  // ENREGISTREMENT DES ACTIVITÉS
  // ============================================

  /**
   * Enregistrer une activité de conduite
   * @param {string} driverId - ID du conducteur
   * @param {Object} activity - Détails de l'activité
   */
  async function recordActivity(driverId, activity) {
    const db = getDb();
    const collection = db.collection('driver_activities');

    const record = {
      _id: new ObjectId(),
      driverId: new ObjectId(driverId),
      type: activity.type,
      startTime: new Date(activity.startTime),
      endTime: activity.endTime ? new Date(activity.endTime) : null,
      duration: activity.duration || null, // en minutes
      vehicleId: activity.vehicleId ? new ObjectId(activity.vehicleId) : null,
      orderId: activity.orderId ? new ObjectId(activity.orderId) : null,
      location: activity.location || null,
      source: activity.source || 'manual', // manual, tachograph, gps
      validated: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Calculer la durée si non fournie
    if (!record.duration && record.endTime) {
      record.duration = Math.round((record.endTime - record.startTime) / (1000 * 60));
    }

    await collection.insertOne(record);

    // Vérifier les infractions potentielles
    await checkCompliance(driverId);

    return record;
  }

  /**
   * Clôturer une activité en cours
   */
  async function endActivity(driverId, activityId, endTime = new Date()) {
    const db = getDb();
    const collection = db.collection('driver_activities');

    const activity = await collection.findOne({
      _id: new ObjectId(activityId),
      driverId: new ObjectId(driverId),
      endTime: null
    });

    if (!activity) {
      return { success: false, error: 'Activity not found or already ended' };
    }

    const duration = Math.round((new Date(endTime) - activity.startTime) / (1000 * 60));

    await collection.updateOne(
      { _id: activity._id },
      {
        $set: {
          endTime: new Date(endTime),
          duration,
          updatedAt: new Date()
        }
      }
    );

    return { success: true, duration };
  }

  // ============================================
  // CALCUL DES TEMPS
  // ============================================

  /**
   * Calculer le temps de conduite restant pour un conducteur
   * @param {string} driverId - ID du conducteur
   * @returns {Object} Temps restants
   */
  async function getRemainingDrivingTime(driverId) {
    const db = getDb();
    const collection = db.collection('driver_activities');

    const now = new Date();

    // Période de 24h glissante pour le temps journalier
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Début de la semaine
    const weekStart = getWeekStart(now);

    // Récupérer les activités
    const activities = await collection.find({
      driverId: new ObjectId(driverId),
      startTime: { $gte: dayStart }
    }).sort({ startTime: 1 }).toArray();

    // Calculer le temps de conduite continue actuel
    let continuousDriving = 0;
    let lastBreakEnd = null;

    // Calculer le temps de conduite journalier
    let dailyDriving = 0;

    // Calculer le temps de conduite hebdomadaire
    const weeklyActivities = await collection.find({
      driverId: new ObjectId(driverId),
      type: DriverActivity.DRIVING,
      startTime: { $gte: weekStart }
    }).toArray();

    let weeklyDriving = weeklyActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

    // Analyser les activités du jour
    for (const activity of activities) {
      if (activity.type === DriverActivity.DRIVING) {
        dailyDriving += activity.duration || 0;

        // Vérifier la conduite continue
        if (lastBreakEnd && activity.startTime > lastBreakEnd) {
          continuousDriving = activity.duration || 0;
        } else {
          continuousDriving += activity.duration || 0;
        }
      } else if (activity.type === DriverActivity.BREAK || activity.type === DriverActivity.REST) {
        // Pause valide si >= 15 minutes
        if (activity.duration >= 15) {
          lastBreakEnd = activity.endTime;
          // Réinitialiser la conduite continue si pause >= 45 min ou cumul >= 45 min
          if (activity.duration >= 45) {
            continuousDriving = 0;
          }
        }
      }
    }

    // Calculer les temps restants
    const remainingContinuous = Math.max(0, regulations.driving.maxContinuous - continuousDriving);
    const remainingDaily = Math.max(0, regulations.driving.maxDaily - dailyDriving);
    const remainingWeekly = Math.max(0, regulations.driving.maxWeekly - weeklyDriving);

    // Déterminer le temps restant effectif (minimum des trois)
    const effectiveRemaining = Math.min(remainingContinuous, remainingDaily, remainingWeekly);

    // Prochaine pause requise
    let nextBreakRequired = null;
    if (continuousDriving > 0) {
      nextBreakRequired = regulations.driving.maxContinuous - continuousDriving;
    }

    return {
      driverId,
      calculatedAt: now,
      continuousDriving: {
        current: continuousDriving,
        max: regulations.driving.maxContinuous,
        remaining: remainingContinuous,
        nextBreakIn: nextBreakRequired
      },
      dailyDriving: {
        current: dailyDriving,
        max: regulations.driving.maxDaily,
        remaining: remainingDaily,
        canExtend: dailyDriving < regulations.driving.maxDailyExtended
      },
      weeklyDriving: {
        current: weeklyDriving,
        max: regulations.driving.maxWeekly,
        remaining: remainingWeekly
      },
      effectiveRemaining,
      breakRequired: remainingContinuous <= 0,
      warnings: getWarnings(remainingContinuous, remainingDaily, remainingWeekly)
    };
  }

  /**
   * Générer les avertissements
   */
  function getWarnings(continuous, daily, weekly) {
    const warnings = [];

    if (continuous <= 30) {
      warnings.push({
        type: 'BREAK_REQUIRED_SOON',
        severity: continuous <= 15 ? 'critical' : 'warning',
        message: `Pause obligatoire dans ${continuous} minutes`
      });
    }

    if (daily <= 60) {
      warnings.push({
        type: 'DAILY_LIMIT_APPROACHING',
        severity: daily <= 30 ? 'critical' : 'warning',
        message: `Limite journalière atteinte dans ${daily} minutes`
      });
    }

    if (weekly <= 120) {
      warnings.push({
        type: 'WEEKLY_LIMIT_APPROACHING',
        severity: weekly <= 60 ? 'critical' : 'warning',
        message: `Limite hebdomadaire atteinte dans ${weekly} minutes`
      });
    }

    return warnings;
  }

  /**
   * Obtenir le début de la semaine
   */
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi
    return new Date(d.setDate(diff));
  }

  // ============================================
  // VÉRIFICATION DE CONFORMITÉ
  // ============================================

  /**
   * Vérifier la conformité réglementaire
   * @param {string} driverId - ID du conducteur
   * @returns {Object} Résultat de conformité
   */
  async function checkCompliance(driverId) {
    const remaining = await getRemainingDrivingTime(driverId);
    const violations = [];

    // Vérifier les violations
    if (remaining.continuousDriving.remaining < 0) {
      violations.push({
        type: 'CONTINUOUS_DRIVING_EXCEEDED',
        severity: 'critical',
        article: 'Art. 7 Règlement 561/2006',
        excess: Math.abs(remaining.continuousDriving.remaining),
        message: `Temps de conduite continue dépassé de ${Math.abs(remaining.continuousDriving.remaining)} minutes`
      });
    }

    if (remaining.dailyDriving.remaining < 0) {
      violations.push({
        type: 'DAILY_DRIVING_EXCEEDED',
        severity: 'critical',
        article: 'Art. 6 Règlement 561/2006',
        excess: Math.abs(remaining.dailyDriving.remaining),
        message: `Temps de conduite journalier dépassé de ${Math.abs(remaining.dailyDriving.remaining)} minutes`
      });
    }

    if (remaining.weeklyDriving.remaining < 0) {
      violations.push({
        type: 'WEEKLY_DRIVING_EXCEEDED',
        severity: 'critical',
        article: 'Art. 6 Règlement 561/2006',
        excess: Math.abs(remaining.weeklyDriving.remaining),
        message: `Temps de conduite hebdomadaire dépassé de ${Math.abs(remaining.weeklyDriving.remaining)} minutes`
      });
    }

    // Enregistrer les violations
    if (violations.length > 0) {
      await recordViolations(driverId, violations);
    }

    return {
      driverId,
      isCompliant: violations.length === 0,
      violations,
      warnings: remaining.warnings,
      checkedAt: new Date()
    };
  }

  /**
   * Enregistrer les violations
   */
  async function recordViolations(driverId, violations) {
    const db = getDb();
    const collection = db.collection('driving_violations');

    for (const violation of violations) {
      await collection.insertOne({
        _id: new ObjectId(),
        driverId: new ObjectId(driverId),
        type: violation.type,
        severity: violation.severity,
        article: violation.article,
        excess: violation.excess,
        message: violation.message,
        status: 'pending',
        detectedAt: new Date(),
        acknowledgedAt: null,
        resolvedAt: null
      });
    }
  }

  // ============================================
  // PLANIFICATION
  // ============================================

  /**
   * Planifier les pauses obligatoires pour un trajet
   * @param {string} driverId - ID du conducteur
   * @param {number} estimatedDuration - Durée estimée en minutes
   * @returns {Object} Planning des pauses
   */
  async function planBreaks(driverId, estimatedDuration) {
    const remaining = await getRemainingDrivingTime(driverId);
    const breaks = [];

    let currentPosition = 0;
    let drivingSinceLastBreak = remaining.continuousDriving.current;

    while (currentPosition < estimatedDuration) {
      const timeUntilBreak = regulations.driving.maxContinuous - drivingSinceLastBreak;

      if (timeUntilBreak <= 0) {
        // Pause immédiate requise
        breaks.push({
          position: currentPosition,
          duration: regulations.breaks.requiredBreak,
          type: 'mandatory',
          reason: 'Temps de conduite continue atteint'
        });
        drivingSinceLastBreak = 0;
        currentPosition += regulations.breaks.requiredBreak;
      } else if (currentPosition + timeUntilBreak < estimatedDuration) {
        // Pause à planifier
        currentPosition += timeUntilBreak;
        breaks.push({
          position: currentPosition,
          duration: regulations.breaks.requiredBreak,
          type: 'mandatory',
          reason: `Pause après ${regulations.driving.maxContinuous / 60}h de conduite`
        });
        drivingSinceLastBreak = 0;
        currentPosition += regulations.breaks.requiredBreak;
      } else {
        break;
      }
    }

    // Vérifier si le trajet dépasse le temps journalier restant
    const totalDrivingNeeded = estimatedDuration - breaks.length * regulations.breaks.requiredBreak;
    const dailyExcess = totalDrivingNeeded - remaining.dailyDriving.remaining;

    return {
      driverId,
      estimatedDuration,
      totalDrivingTime: totalDrivingNeeded,
      breaks,
      numberOfBreaks: breaks.length,
      totalBreakTime: breaks.length * regulations.breaks.requiredBreak,
      estimatedArrival: estimatedDuration + breaks.length * regulations.breaks.requiredBreak,
      warnings: dailyExcess > 0 ? [{
        type: 'DAILY_LIMIT_WOULD_BE_EXCEEDED',
        message: `Le trajet dépasserait la limite journalière de ${dailyExcess} minutes`,
        suggestion: 'Prévoir un repos journalier ou fractionner le trajet'
      }] : []
    };
  }

  // ============================================
  // RAPPORTS
  // ============================================

  /**
   * Générer le rapport de temps de conduite
   * @param {string} driverId - ID du conducteur
   * @param {Date} startDate - Date de début
   * @param {Date} endDate - Date de fin
   */
  async function generateDrivingReport(driverId, startDate, endDate) {
    const db = getDb();
    const activitiesCollection = db.collection('driver_activities');
    const violationsCollection = db.collection('driving_violations');

    // Récupérer les activités
    const activities = await activitiesCollection.find({
      driverId: new ObjectId(driverId),
      startTime: { $gte: startDate, $lte: endDate }
    }).sort({ startTime: 1 }).toArray();

    // Récupérer les violations
    const violations = await violationsCollection.find({
      driverId: new ObjectId(driverId),
      detectedAt: { $gte: startDate, $lte: endDate }
    }).toArray();

    // Calculer les totaux par type d'activité
    const totals = {
      driving: 0,
      otherWork: 0,
      availability: 0,
      rest: 0,
      break: 0
    };

    activities.forEach(a => {
      switch (a.type) {
        case DriverActivity.DRIVING:
          totals.driving += a.duration || 0;
          break;
        case DriverActivity.OTHER_WORK:
          totals.otherWork += a.duration || 0;
          break;
        case DriverActivity.AVAILABILITY:
          totals.availability += a.duration || 0;
          break;
        case DriverActivity.REST:
          totals.rest += a.duration || 0;
          break;
        case DriverActivity.BREAK:
          totals.break += a.duration || 0;
          break;
      }
    });

    // Regrouper par jour
    const dailyBreakdown = {};
    activities.forEach(a => {
      const day = a.startTime.toISOString().split('T')[0];
      if (!dailyBreakdown[day]) {
        dailyBreakdown[day] = {
          driving: 0,
          otherWork: 0,
          rest: 0,
          break: 0
        };
      }
      if (a.type === DriverActivity.DRIVING) {
        dailyBreakdown[day].driving += a.duration || 0;
      } else if (a.type === DriverActivity.REST || a.type === DriverActivity.BREAK) {
        dailyBreakdown[day].rest += a.duration || 0;
      }
    });

    return {
      driverId,
      period: { start: startDate, end: endDate },
      totals: {
        drivingMinutes: totals.driving,
        drivingHours: (totals.driving / 60).toFixed(2),
        otherWorkMinutes: totals.otherWork,
        restMinutes: totals.rest + totals.break,
        totalWorkMinutes: totals.driving + totals.otherWork + totals.availability
      },
      dailyBreakdown: Object.entries(dailyBreakdown).map(([date, data]) => ({
        date,
        drivingHours: (data.driving / 60).toFixed(2),
        restHours: (data.rest / 60).toFixed(2),
        compliant: data.driving <= regulations.driving.maxDaily
      })),
      violations: {
        count: violations.length,
        critical: violations.filter(v => v.severity === 'critical').length,
        details: violations
      },
      compliance: {
        weeklyLimit: totals.driving <= regulations.driving.maxWeekly,
        averageDailyDriving: (totals.driving / 7).toFixed(2)
      },
      generatedAt: new Date()
    };
  }

  // ============================================
  // RETURN SERVICE
  // ============================================

  return {
    // Configuration
    DRIVING_REGULATIONS,
    DriverActivity,

    // Activités
    recordActivity,
    endActivity,

    // Temps restant
    getRemainingDrivingTime,

    // Conformité
    checkCompliance,

    // Planification
    planBreaks,

    // Rapports
    generateDrivingReport
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  DRIVING_REGULATIONS,
  DriverActivity,
  createDrivingTimeService
};
