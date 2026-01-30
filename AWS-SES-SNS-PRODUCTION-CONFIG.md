# Configuration AWS SES et SNS pour SYMPHONI.A - Production

## Statut de la Configuration

**Date de configuration:** 2026-01-29
**Compte AWS:** 004843574253
**Regions:**
- SES: eu-west-1 (Irlande)
- Services EB: eu-central-1 (Francfort)

---

## 1. AWS SES - Simple Email Service

### Statut du Compte

- **Mode:** Production (GRANTED)
- **ProductionAccessEnabled:** true
- **EnforcementStatus:** HEALTHY
- **SendingEnabled:** true
- **Case ID:** 176970657600366

### Quotas et Limites

| Metrique | Valeur |
|----------|--------|
| Max emails/24h | 50,000 emails |
| Max envois/seconde | 14 emails/sec |
| Emails envoyes (24h) | 0 (initial) |

### Domaine Verifie

- **Domaine:** symphonia-controltower.com
- **Type:** DOMAIN
- **Status:** SUCCESS (Verifie)
- **DKIM:** Active et configuree
- **Verification Status:** SUCCESS

### Configuration DKIM

```
Status: SUCCESS
Signing Enabled: true
Tokens:
- fgczi5zfgdlxnwyugnhig4et7twftzlo
- xboinvea7kmbr3vc3fx5dburrvtjp2by
- ynokzonetscm4ph2c3kstjchuptjkxmy
Key Length: RSA_2048_BIT
```

### Adresses Email Configurees

1. **ne-pas-repondre@symphonia-controltower.com** (Principal)
2. **notifications@symphonia-controltower.com** (Notifications)
3. **facturation@symphonia-controltower.com** (Facturation)
4. **support@symphonia-controltower.com** (Support)
5. **affret-ia@symphonia-controltower.com** (Affret IA)

---

## 2. AWS SNS - Simple Notification Service

### Topic SMS

- **Nom:** symphonia-sms-notifications
- **ARN:** arn:aws:sns:eu-west-1:004843574253:symphonia-sms-notifications
- **Region:** eu-west-1
- **DisplayName:** SYMPHONIA SMS

### Configuration SMS

```
DefaultSMSType: Transactional
DefaultSenderID: SYMPHONIA
```

---

## 3. Services Elastic Beanstalk Configures

Les variables d'environnement suivantes ont ete configurees pour tous les services:

### Services Configures

1. **rt-subscriptions-api-prod-v5**
   - Status: Updating → Green
   - Version: v4.1.4-fix-invitation-url

2. **rt-orders-api-prod-v2**
   - Status: Updating → Green
   - Version: v2.64.0-with-deps

3. **rt-billing-api-prod**
   - Status: Updating → Green
   - Version: v1.1.3-prefact

4. **rt-affret-ia-api-prod-v4**
   - Status: Updating → Green
   - Version: v2.6.1-axios
   - Note: Variable SES_AFFRET_EMAIL specifique

5. **rt-authz-api-prod**
   - Status: Updating → Green
   - Version: v3.9.3-roles-v2

### Variables d'Environnement Communes

```bash
AWS_SES_REGION=eu-west-1
SES_FROM_EMAIL=ne-pas-repondre@symphonia-controltower.com
SES_NOTIFICATIONS_EMAIL=notifications@symphonia-controltower.com
SES_BILLING_EMAIL=facturation@symphonia-controltower.com
SES_SUPPORT_EMAIL=support@symphonia-controltower.com
SNS_TOPIC_ARN=arn:aws:sns:eu-west-1:004843574253:symphonia-sms-notifications
```

### Variable Specifique pour Affret IA

```bash
SES_AFFRET_EMAIL=affret-ia@symphonia-controltower.com
```

---

## 4. Tests Effectues

### Test d'Envoi Email

**Commande:**
```bash
aws sesv2 send-email \
  --region eu-west-1 \
  --from-email-address ne-pas-repondre@symphonia-controltower.com \
  --destination ToAddresses=r.tardy@rt-groupe.com \
  --content "Simple={Subject={Data='Test SYMPHONIA Production SES',Charset=utf-8},Body={Text={Data='Email de test',Charset=utf-8}}}"
```

**Resultat:**
- Status: SUCCESS
- MessageId: 0102019c0ac9c99c-8d6cc154-6628-4d85-ba7f-9198857029fa-000000

---

## 5. Commandes de Verification

### Verifier le statut du compte SES

```bash
aws sesv2 get-account --region eu-west-1
```

### Verifier l'identite du domaine

```bash
aws sesv2 get-email-identity --email-identity symphonia-controltower.com --region eu-west-1
```

### Verifier les variables d'un environnement EB

```bash
aws elasticbeanstalk describe-configuration-settings \
  --environment-name <env-name> \
  --application-name <app-name> \
  --region eu-central-1 \
  --query "ConfigurationSettings[0].OptionSettings[?Namespace=='aws:elasticbeanstalk:application:environment' && (contains(OptionName, 'SES') || contains(OptionName, 'SNS'))]"
```

### Envoyer un email de test

```bash
aws sesv2 send-email \
  --region eu-west-1 \
  --from-email-address ne-pas-repondre@symphonia-controltower.com \
  --destination ToAddresses=<email-destinataire> \
  --content "Simple={Subject={Data='Test',Charset=utf-8},Body={Text={Data='Message de test',Charset=utf-8}}}"
```

### Verifier les statistiques d'envoi

```bash
aws sesv2 get-account --region eu-west-1 --query "SendQuota"
```

---

## 6. Suppression Automatique

SES a la suppression automatique activee pour:
- **BOUNCE** (Rebonds)
- **COMPLAINT** (Plaintes)

Les emails vers ces adresses seront automatiquement bloques pour proteger la reputation de l'expediteur.

---

## 7. Recommandations

### Monitoring

1. Surveiller les quotas d'envoi regulierement
2. Configurer des alarmes CloudWatch pour:
   - Taux de bounce > 5%
   - Taux de plaintes > 0.1%
   - Utilisation quota > 80%

### Commandes CloudWatch

```bash
# Creer une alarme pour le taux de bounce
aws cloudwatch put-metric-alarm \
  --alarm-name ses-bounce-rate-high \
  --alarm-description "Alert when SES bounce rate is too high" \
  --metric-name Reputation.BounceRate \
  --namespace AWS/SES \
  --statistic Average \
  --period 3600 \
  --threshold 0.05 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### Bonnes Pratiques

1. Utiliser des templates SES pour les emails recurrents
2. Implementer un mecanisme de retry pour les echecs temporaires
3. Logger tous les envois d'emails avec leur MessageId
4. Gerer les webhooks SNS pour les notifications de bounce/complaint
5. Tester regulierement avec des emails de test

### Prochaines Etapes

1. Configurer les webhooks SNS pour les notifications SES
2. Creer des templates SES pour les emails types
3. Mettre en place le monitoring CloudWatch
4. Documenter les cas d'usage par service

---

## 8. Informations de Contact AWS

- **Email de contact supplementaire:** r.tardy@rt-groupe.com
- **Type d'emails:** TRANSACTIONAL
- **Site web:** https://symphonia-controltower.com
- **Description:** Plateforme de gestion logistique SYMPHONI.A

---

## 9. Troubleshooting

### Email non recu

1. Verifier les quotas: `aws sesv2 get-account --region eu-west-1`
2. Verifier la liste de suppression: `aws sesv2 list-suppressed-destinations --region eu-west-1`
3. Consulter les logs CloudWatch du service expediteur

### Variables d'environnement non prises en compte

1. Attendre la fin du deploiement EB (status: Ready)
2. Verifier les variables: `aws elasticbeanstalk describe-configuration-settings`
3. Redemarrer l'environnement si necessaire

### Erreur d'authentification SES

1. Verifier les permissions IAM du role EB
2. S'assurer que le role a les permissions `ses:SendEmail` et `ses:SendRawEmail`

---

**Configuration terminee avec succes le 2026-01-29**
