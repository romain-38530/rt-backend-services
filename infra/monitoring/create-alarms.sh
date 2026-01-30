#!/bin/bash

# Script de création des alarmes CloudWatch pour SYMPHONI.A
# Région AWS
REGION="eu-central-1"

# Couleurs pour l'affichage
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Création des alarmes CloudWatch pour SYMPHONI.A ===${NC}\n"

# Liste des environnements Elastic Beanstalk à monitorer
declare -A ENVIRONMENTS=(
    ["TMS-Sync"]="rt-tms-sync-api-v2"
    ["Affret-IA"]="rt-affret-ia-api-prod"
    ["Orders"]="rt-orders-api-prod-v2"
    ["Subscriptions"]="rt-subscriptions-api-prod-v5"
    ["Auth"]="rt-authz-api-prod"
    ["Billing"]="rt-billing-api-prod"
)

# Fonction pour créer une alarme
create_alarm() {
    local service_name=$1
    local env_name=$2
    local alarm_name=$3
    local metric_name=$4
    local threshold=$5
    local comparison=$6
    local alarm_description=$7
    local namespace=$8
    local statistic=${9:-Average}
    local period=${10:-300}
    local evaluation_periods=${11:-2}
    local unit=${12:-}

    echo -e "${YELLOW}Création de l'alarme: ${alarm_name}${NC}"

    cmd="aws cloudwatch put-metric-alarm \
        --alarm-name \"${alarm_name}\" \
        --alarm-description \"${alarm_description}\" \
        --metric-name \"${metric_name}\" \
        --namespace \"${namespace}\" \
        --statistic \"${statistic}\" \
        --period ${period} \
        --evaluation-periods ${evaluation_periods} \
        --threshold ${threshold} \
        --comparison-operator ${comparison} \
        --dimensions Name=EnvironmentName,Value=${env_name} \
        --region ${REGION}"

    if [ -n "$unit" ]; then
        cmd="$cmd --unit \"${unit}\""
    fi

    if eval $cmd; then
        echo -e "${GREEN}✓ Alarme créée: ${alarm_name}${NC}\n"
    else
        echo -e "${RED}✗ Échec de création: ${alarm_name}${NC}\n"
    fi
}

# Créer les alarmes pour chaque service
for service_name in "${!ENVIRONMENTS[@]}"; do
    env_name="${ENVIRONMENTS[$service_name]}"

    echo -e "\n${GREEN}=== Configuration des alarmes pour ${service_name} (${env_name}) ===${NC}\n"

    # Alarme CPU > 80%
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-High-CPU" \
        "CPUUtilization" \
        "80" \
        "GreaterThanThreshold" \
        "${service_name} CPU utilization > 80%" \
        "AWS/ElasticBeanstalk" \
        "Average" \
        "300" \
        "2" \
        "Percent"

    # Alarme Memory > 85%
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-High-Memory" \
        "MemoryUtilization" \
        "85" \
        "GreaterThanThreshold" \
        "${service_name} Memory utilization > 85%" \
        "CWAgent" \
        "Average" \
        "300" \
        "2" \
        "Percent"

    # Alarme HTTP 5xx > 10/minute
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-High-5xx-Errors" \
        "ApplicationRequests5xx" \
        "10" \
        "GreaterThanThreshold" \
        "${service_name} HTTP 5xx errors > 10/minute" \
        "AWS/ElasticBeanstalk" \
        "Sum" \
        "60" \
        "2" \
        "Count"

    # Alarme HTTP 4xx > 50/minute
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-High-4xx-Errors" \
        "ApplicationRequests4xx" \
        "50" \
        "GreaterThanThreshold" \
        "${service_name} HTTP 4xx errors > 50/minute" \
        "AWS/ElasticBeanstalk" \
        "Sum" \
        "60" \
        "2" \
        "Count"

    # Alarme Health Status Degraded
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-Environment-Health-Degraded" \
        "EnvironmentHealth" \
        "15" \
        "GreaterThanThreshold" \
        "${service_name} Environment health is degraded" \
        "AWS/ElasticBeanstalk" \
        "Average" \
        "60" \
        "1"

    # Alarme Latence > 2 secondes
    create_alarm \
        "${service_name}" \
        "${env_name}" \
        "${service_name}-High-Latency" \
        "ApplicationLatencyP99" \
        "2" \
        "GreaterThanThreshold" \
        "${service_name} P99 Latency > 2 seconds" \
        "AWS/ElasticBeanstalk" \
        "Average" \
        "300" \
        "2" \
        "Seconds"

done

# Alarmes spécifiques pour Amplify Frontend
echo -e "\n${GREEN}=== Configuration des alarmes pour Frontend Amplify ===${NC}\n"

AMPLIFY_APP_ID="d1tb834u144p4r"

# Alarme Bytes Downloaded > 10GB/jour
create_alarm \
    "Frontend-Amplify" \
    "${AMPLIFY_APP_ID}" \
    "Frontend-High-Traffic" \
    "BytesDownloaded" \
    "10737418240" \
    "GreaterThanThreshold" \
    "Frontend Amplify traffic > 10GB/day" \
    "AWS/AmplifyHosting" \
    "Sum" \
    "86400" \
    "1" \
    "Bytes"

# Alarme Request Count > 100000/jour
create_alarm \
    "Frontend-Amplify" \
    "${AMPLIFY_APP_ID}" \
    "Frontend-High-Request-Count" \
    "Requests" \
    "100000" \
    "GreaterThanThreshold" \
    "Frontend Amplify requests > 100k/day" \
    "AWS/AmplifyHosting" \
    "Sum" \
    "86400" \
    "1" \
    "Count"

# Alarmes SES (Simple Email Service)
echo -e "\n${GREEN}=== Configuration des alarmes pour SES ===${NC}\n"

# Alarme Bounce Rate > 5%
aws cloudwatch put-metric-alarm \
    --alarm-name "SES-High-Bounce-Rate" \
    --alarm-description "SES bounce rate > 5%" \
    --metric-name "Reputation.BounceRate" \
    --namespace "AWS/SES" \
    --statistic "Average" \
    --period 86400 \
    --evaluation-periods 1 \
    --threshold 0.05 \
    --comparison-operator GreaterThanThreshold \
    --region ${REGION}

echo -e "${GREEN}✓ Alarme SES Bounce Rate créée${NC}\n"

# Alarme Complaint Rate > 0.1%
aws cloudwatch put-metric-alarm \
    --alarm-name "SES-High-Complaint-Rate" \
    --alarm-description "SES complaint rate > 0.1%" \
    --metric-name "Reputation.ComplaintRate" \
    --namespace "AWS/SES" \
    --statistic "Average" \
    --period 86400 \
    --evaluation-periods 1 \
    --threshold 0.001 \
    --comparison-operator GreaterThanThreshold \
    --region ${REGION}

echo -e "${GREEN}✓ Alarme SES Complaint Rate créée${NC}\n"

echo -e "\n${GREEN}=== Toutes les alarmes ont été créées avec succès ===${NC}\n"
echo -e "${YELLOW}Pour vérifier les alarmes créées:${NC}"
echo "aws cloudwatch describe-alarms --region ${REGION}"
echo ""
echo -e "${YELLOW}Pour voir les alarmes en état d'alarme:${NC}"
echo "aws cloudwatch describe-alarms --state-value ALARM --region ${REGION}"
