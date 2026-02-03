#!/bin/bash

DOMAIN="symphonia-controltower.com"

echo "==================================================="
echo "  VÉRIFICATION DNS ANTI-SPAM - $DOMAIN"
echo "==================================================="
echo ""

# SPF
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. SPF (Sender Policy Framework)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
SPF=$(dig TXT $DOMAIN +short | grep "v=spf1")
if [ -z "$SPF" ]; then
  echo "❌ SPF NOT FOUND"
  echo ""
  echo "Action requise: Ajouter enregistrement DNS"
  echo "Type: TXT"
  echo "Name: $DOMAIN"
  echo "Value: v=spf1 include:amazonses.com ~all"
else
  echo "✅ SPF FOUND:"
  echo "$SPF"
fi
echo ""

# DMARC
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. DMARC (Domain-based Message Authentication)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
DMARC=$(dig TXT _dmarc.$DOMAIN +short)
if [ -z "$DMARC" ]; then
  echo "❌ DMARC NOT FOUND"
  echo ""
  echo "Action requise: Ajouter enregistrement DNS"
  echo "Type: TXT"
  echo "Name: _dmarc.$DOMAIN"
  echo "Value: v=DMARC1; p=none; rua=mailto:dmarc@$DOMAIN"
else
  echo "✅ DMARC FOUND:"
  echo "$DMARC"
fi
echo ""

# DKIM
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. DKIM (DomainKeys Identified Mail)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  DKIM nécessite activation dans AWS SES Console"
echo ""
echo "Étapes:"
echo "1. https://console.aws.amazon.com/ses/home?region=eu-central-1#verified-senders-domain:"
echo "2. Sélectionner: $DOMAIN"
echo "3. Onglet: DKIM"
echo "4. Cliquer: Enable DKIM"
echo "5. Copier les 3 enregistrements CNAME générés"
echo "6. Les ajouter dans votre DNS"
echo ""
DKIM_SELECTOR=$(dig TXT _domainkey.$DOMAIN +short)
if [ -z "$DKIM_SELECTOR" ]; then
  echo "❌ DKIM NOT CONFIGURED"
else
  echo "✅ DKIM FOUND"
fi
echo ""

# Custom MAIL FROM
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Custom MAIL FROM Domain"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
MAIL_FROM_MX=$(dig MX mail.$DOMAIN +short)
if [ -z "$MAIL_FROM_MX" ]; then
  echo "❌ Custom MAIL FROM NOT CONFIGURED"
  echo ""
  echo "Action requise:"
  echo "Type: MX"
  echo "Name: mail.$DOMAIN"
  echo "Value: 10 feedback-smtp.eu-central-1.amazonses.com"
  echo ""
  echo "Type: TXT"
  echo "Name: mail.$DOMAIN"
  echo "Value: v=spf1 include:amazonses.com ~all"
else
  echo "✅ Custom MAIL FROM FOUND:"
  echo "$MAIL_FROM_MX"
fi
echo ""

# Résumé
echo "==================================================="
echo "  RÉSUMÉ"
echo "==================================================="
echo ""

SCORE=0
MAX_SCORE=4

if [ ! -z "$SPF" ]; then
  echo "✅ SPF configuré"
  SCORE=$((SCORE + 1))
else
  echo "❌ SPF manquant"
fi

if [ ! -z "$DMARC" ]; then
  echo "✅ DMARC configuré"
  SCORE=$((SCORE + 1))
else
  echo "❌ DMARC manquant"
fi

if [ ! -z "$DKIM_SELECTOR" ]; then
  echo "✅ DKIM configuré"
  SCORE=$((SCORE + 1))
else
  echo "❌ DKIM manquant"
fi

if [ ! -z "$MAIL_FROM_MX" ]; then
  echo "✅ Custom MAIL FROM configuré"
  SCORE=$((SCORE + 1))
else
  echo "❌ Custom MAIL FROM manquant"
fi

echo ""
echo "Score: $SCORE/$MAX_SCORE"
echo ""

if [ $SCORE -eq $MAX_SCORE ]; then
  echo "🎉 Configuration DNS COMPLÈTE !"
  echo "   Vos emails ne devraient plus aller en spam."
elif [ $SCORE -ge 2 ]; then
  echo "⚠️  Configuration DNS PARTIELLE"
  echo "   Complétez les enregistrements manquants."
else
  echo "❌ Configuration DNS INSUFFISANTE"
  echo "   URGENT: Configurez SPF et DMARC minimum."
fi

echo ""
echo "==================================================="
echo ""

echo "📋 Prochaines étapes:"
echo ""
echo "1. Ajouter les enregistrements DNS manquants"
echo "2. Attendre propagation DNS (24-48h)"
echo "3. Vérifier avec: ./scripts/check-dns-antispam.sh"
echo "4. Tester sur: https://www.mail-tester.com"
echo ""
echo "Documentation complète: ANTI-SPAM-CONFIGURATION.md"
echo ""
