#!/bin/bash
################################################################################
# Script d'Exécution Quotidienne - Routine Autonome AWS
################################################################################
# Usage: Planifier ce script pour exécution quotidienne via:
#        - Planificateur de tâches Windows
#        - Cron (si disponible)
#        - Exécution manuelle quotidienne
################################################################################

# Aller dans le répertoire du script
cd "$(dirname "$0")"

# Créer dossier logs si nécessaire
mkdir -p logs

# Fichier de log quotidien
LOG_FILE="logs/daily-optimizer-$(date +%Y%m%d).log"

echo "=============================================" | tee -a "$LOG_FILE"
echo "Routine Autonome AWS - $(date)" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Exécuter l'optimiseur en mode dry-run
echo "Exécution de l'analyse..." | tee -a "$LOG_FILE"
./autonomous-optimizer.sh --dry-run >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Analyse terminée avec succès" | tee -a "$LOG_FILE"
else
    echo "⚠️ Analyse terminée avec avertissements (Exit code: $EXIT_CODE)" | tee -a "$LOG_FILE"
    echo "   Ceci est normal - des opportunités ont été détectées !" | tee -a "$LOG_FILE"
fi

echo "=============================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Extraire et afficher le résumé
echo "📊 RÉSUMÉ:" | tee -a "$LOG_FILE"
grep "OPPORTUNITÉ" "$LOG_FILE" | tail -10 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "📄 Log complet: $LOG_FILE" | tee -a "$LOG_FILE"
echo "📁 Logs détaillés: reports/autonomous-optimization/" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Archiver vieux logs (>30 jours)
find logs/ -name "daily-optimizer-*.log" -mtime +30 -delete 2>/dev/null || true

echo "✅ Routine quotidienne terminée à $(date)" | tee -a "$LOG_FILE"
