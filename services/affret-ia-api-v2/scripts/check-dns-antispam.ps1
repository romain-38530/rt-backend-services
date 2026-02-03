# Script PowerShell pour vérifier la configuration DNS anti-spam

$DOMAIN = "symphonia-controltower.com"

Write-Host "==================================================="
Write-Host "  VÉRIFICATION DNS ANTI-SPAM - $DOMAIN"
Write-Host "==================================================="
Write-Host ""

# SPF
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "1. SPF (Sender Policy Framework)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

$SPF = Resolve-DnsName -Name $DOMAIN -Type TXT -ErrorAction SilentlyContinue | Where-Object { $_.Strings -like "*v=spf1*" }

if ($null -eq $SPF) {
    Write-Host "❌ SPF NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "Action requise: Ajouter enregistrement DNS"
    Write-Host "Type: TXT"
    Write-Host "Name: $DOMAIN"
    Write-Host "Value: v=spf1 include:amazonses.com ~all"
} else {
    Write-Host "✅ SPF FOUND:" -ForegroundColor Green
    Write-Host $SPF.Strings
}
Write-Host ""

# DMARC
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "2. DMARC (Domain-based Message Authentication)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

$DMARC = Resolve-DnsName -Name "_dmarc.$DOMAIN" -Type TXT -ErrorAction SilentlyContinue

if ($null -eq $DMARC) {
    Write-Host "❌ DMARC NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "Action requise: Ajouter enregistrement DNS"
    Write-Host "Type: TXT"
    Write-Host "Name: _dmarc.$DOMAIN"
    Write-Host "Value: v=DMARC1; p=none; rua=mailto:dmarc@$DOMAIN"
} else {
    Write-Host "✅ DMARC FOUND:" -ForegroundColor Green
    Write-Host $DMARC.Strings
}
Write-Host ""

# DKIM
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "3. DKIM (DomainKeys Identified Mail)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "⚠️  DKIM nécessite activation dans AWS SES Console" -ForegroundColor Yellow
Write-Host ""
Write-Host "Étapes:"
Write-Host "1. https://console.aws.amazon.com/ses/home?region=eu-central-1#verified-senders-domain:"
Write-Host "2. Sélectionner: $DOMAIN"
Write-Host "3. Onglet: DKIM"
Write-Host "4. Cliquer: Enable DKIM"
Write-Host "5. Copier les 3 enregistrements CNAME générés"
Write-Host "6. Les ajouter dans votre DNS"
Write-Host ""

$DKIM = Resolve-DnsName -Name "_domainkey.$DOMAIN" -Type TXT -ErrorAction SilentlyContinue

if ($null -eq $DKIM) {
    Write-Host "❌ DKIM NOT CONFIGURED" -ForegroundColor Red
} else {
    Write-Host "✅ DKIM FOUND" -ForegroundColor Green
}
Write-Host ""

# Custom MAIL FROM
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "4. Custom MAIL FROM Domain"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

$MAIL_FROM = Resolve-DnsName -Name "mail.$DOMAIN" -Type MX -ErrorAction SilentlyContinue

if ($null -eq $MAIL_FROM) {
    Write-Host "❌ Custom MAIL FROM NOT CONFIGURED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Action requise:"
    Write-Host "Type: MX"
    Write-Host "Name: mail.$DOMAIN"
    Write-Host "Value: 10 feedback-smtp.eu-central-1.amazonses.com"
    Write-Host ""
    Write-Host "Type: TXT"
    Write-Host "Name: mail.$DOMAIN"
    Write-Host "Value: v=spf1 include:amazonses.com ~all"
} else {
    Write-Host "✅ Custom MAIL FROM FOUND:" -ForegroundColor Green
    Write-Host $MAIL_FROM.NameExchange
}
Write-Host ""

# Résumé
Write-Host "==================================================="
Write-Host "  RÉSUMÉ"
Write-Host "==================================================="
Write-Host ""

$SCORE = 0
$MAX_SCORE = 4

if ($null -ne $SPF) {
    Write-Host "✅ SPF configuré" -ForegroundColor Green
    $SCORE++
} else {
    Write-Host "❌ SPF manquant" -ForegroundColor Red
}

if ($null -ne $DMARC) {
    Write-Host "✅ DMARC configuré" -ForegroundColor Green
    $SCORE++
} else {
    Write-Host "❌ DMARC manquant" -ForegroundColor Red
}

if ($null -ne $DKIM) {
    Write-Host "✅ DKIM configuré" -ForegroundColor Green
    $SCORE++
} else {
    Write-Host "❌ DKIM manquant" -ForegroundColor Red
}

if ($null -ne $MAIL_FROM) {
    Write-Host "✅ Custom MAIL FROM configuré" -ForegroundColor Green
    $SCORE++
} else {
    Write-Host "❌ Custom MAIL FROM manquant" -ForegroundColor Red
}

Write-Host ""
Write-Host "Score: $SCORE/$MAX_SCORE"
Write-Host ""

if ($SCORE -eq $MAX_SCORE) {
    Write-Host "🎉 Configuration DNS COMPLÈTE !" -ForegroundColor Green
    Write-Host "   Vos emails ne devraient plus aller en spam."
} elseif ($SCORE -ge 2) {
    Write-Host "⚠️  Configuration DNS PARTIELLE" -ForegroundColor Yellow
    Write-Host "   Complétez les enregistrements manquants."
} else {
    Write-Host "❌ Configuration DNS INSUFFISANTE" -ForegroundColor Red
    Write-Host "   URGENT: Configurez SPF et DMARC minimum."
}

Write-Host ""
Write-Host "==================================================="
Write-Host ""

Write-Host "📋 Prochaines étapes:"
Write-Host ""
Write-Host "1. Ajouter les enregistrements DNS manquants"
Write-Host "2. Attendre propagation DNS (24-48h)"
Write-Host "3. Vérifier avec: .\scripts\check-dns-antispam.ps1"
Write-Host "4. Tester sur: https://www.mail-tester.com"
Write-Host ""
Write-Host "Documentation complète: ANTI-SPAM-CONFIGURATION.md"
Write-Host ""
