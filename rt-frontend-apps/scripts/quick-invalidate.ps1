# ============================================================================
# Quick Invalidate - Script Rapide pour Invalidation CloudFront
# ============================================================================
# Usage: .\quick-invalidate.ps1
#
# Ce script est une version ultra-simplifiée pour une invalidation rapide
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n🔄 Invalidation CloudFront en cours..." -ForegroundColor Cyan

# Trouver le Distribution ID
Write-Host "📦 Recherche de la distribution..." -ForegroundColor Yellow
$DIST_ID = aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" --output text

if ([string]::IsNullOrWhiteSpace($DIST_ID)) {
    Write-Host "❌ Distribution non trouvée!" -ForegroundColor Red
    Write-Host "Utilisez: .\invalidate-cloudfront.ps1 pour plus de détails" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Distribution trouvée: $DIST_ID" -ForegroundColor Green

# Créer l'invalidation
Write-Host "🚀 Création de l'invalidation..." -ForegroundColor Yellow
$RESULT = aws cloudfront create-invalidation `
    --distribution-id $DIST_ID `
    --paths "/*" "/_next/static/*" "/_next/static/chunks/*" `
    --output json | ConvertFrom-Json

$INV_ID = $RESULT.Invalidation.Id
$STATUS = $RESULT.Invalidation.Status

Write-Host "✅ Invalidation créée!" -ForegroundColor Green
Write-Host "   ID: $INV_ID" -ForegroundColor Cyan
Write-Host "   Status: $STATUS" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏳ L'invalidation prendra 5-15 minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pour suivre le statut:" -ForegroundColor Cyan
Write-Host "  aws cloudfront get-invalidation --distribution-id $DIST_ID --id $INV_ID" -ForegroundColor White
Write-Host ""
Write-Host "✅ Terminé!" -ForegroundColor Green
Write-Host ""
