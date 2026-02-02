# ============================================================================
# Script d'Invalidation CloudFront - Solutions Alternatives
# ============================================================================
# Ce script offre des méthodes alternatives si le script principal échoue
# ============================================================================

param(
    [string]$DistributionId = "",
    [switch]$ListDistributions = $false,
    [switch]$ListInvalidations = $false,
    [switch]$Manual = $false
)

function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }

Write-Info "`n============================================================================"
Write-Info "  CloudFront - Solutions Alternatives"
Write-Info "============================================================================`n"

# ============================================================================
# Option 1: Lister toutes les distributions
# ============================================================================
if ($ListDistributions) {
    Write-Info "[Option 1] Liste de toutes les distributions CloudFront`n"

    try {
        $distributions = aws cloudfront list-distributions --output json | ConvertFrom-Json

        if ($distributions.DistributionList.Items.Count -eq 0) {
            Write-Warning "Aucune distribution trouvée."
            exit 0
        }

        Write-Success "Distributions trouvées: $($distributions.DistributionList.Items.Count)`n"

        foreach ($dist in $distributions.DistributionList.Items) {
            Write-Info "----------------------------------------"
            Write-Info "ID: $($dist.Id)"
            Write-Info "Domain: $($dist.DomainName)"
            Write-Info "Status: $($dist.Status)"
            Write-Info "Enabled: $($dist.Enabled)"

            if ($dist.Aliases.Items.Count -gt 0) {
                Write-Info "Aliases:"
                foreach ($alias in $dist.Aliases.Items) {
                    Write-Info "  - $alias"
                }
            }

            if ($dist.Origins.Items.Count -gt 0) {
                Write-Info "Origins:"
                foreach ($origin in $dist.Origins.Items) {
                    Write-Info "  - $($origin.DomainName)"
                }
            }

            Write-Info "Console URL:"
            Write-Info "  https://console.aws.amazon.com/cloudfront/v3/home#/distributions/$($dist.Id)"
            Write-Info ""
        }

        Write-Success "✓ Pour invalider une distribution, utilisez:"
        Write-Info "  .\invalidate-cloudfront.ps1 -DistributionId <ID>`n"

    } catch {
        Write-Error "Erreur lors de la récupération des distributions:"
        Write-Error $_.Exception.Message
        exit 1
    }

    exit 0
}

# ============================================================================
# Option 2: Lister les invalidations existantes
# ============================================================================
if ($ListInvalidations) {
    if ([string]::IsNullOrEmpty($DistributionId)) {
        Write-Error "Le paramètre -DistributionId est requis pour lister les invalidations"
        Write-Info "Usage: .\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E1234567890ABC"
        exit 1
    }

    Write-Info "[Option 2] Liste des invalidations pour la distribution: $DistributionId`n"

    try {
        $invalidations = aws cloudfront list-invalidations `
            --distribution-id $DistributionId `
            --output json | ConvertFrom-Json

        if ($invalidations.InvalidationList.Items.Count -eq 0) {
            Write-Warning "Aucune invalidation trouvée pour cette distribution."
            exit 0
        }

        Write-Success "Invalidations trouvées: $($invalidations.InvalidationList.Items.Count)`n"

        foreach ($inv in $invalidations.InvalidationList.Items) {
            Write-Info "----------------------------------------"
            Write-Info "ID: $($inv.Id)"
            Write-Info "Status: $($inv.Status)"
            Write-Info "Create Time: $($inv.CreateTime)"

            # Récupérer les détails
            try {
                $details = aws cloudfront get-invalidation `
                    --distribution-id $DistributionId `
                    --id $inv.Id `
                    --output json | ConvertFrom-Json

                if ($details.Invalidation.InvalidationBatch.Paths.Items) {
                    Write-Info "Paths:"
                    foreach ($path in $details.Invalidation.InvalidationBatch.Paths.Items) {
                        Write-Info "  - $path"
                    }
                }
            } catch {
                Write-Warning "  Impossible de récupérer les détails"
            }

            Write-Info ""
        }

    } catch {
        Write-Error "Erreur lors de la récupération des invalidations:"
        Write-Error $_.Exception.Message
        exit 1
    }

    exit 0
}

# ============================================================================
# Option 3: Guide manuel pour la console AWS
# ============================================================================
if ($Manual) {
    Write-Info "[Option 3] Guide d'invalidation via la console AWS`n"

    Write-Success "MÉTHODE 1: Via AWS Console (Interface Web)`n"

    Write-Info "Étape 1: Accéder à CloudFront"
    Write-Info "  1. Connectez-vous à: https://console.aws.amazon.com/cloudfront/"
    Write-Info "  2. Assurez-vous d'être dans la bonne région AWS`n"

    Write-Info "Étape 2: Trouver la distribution"
    Write-Info "  1. Recherchez la distribution avec le domaine: d3fy85w9zy25oo.cloudfront.net"
    Write-Info "  2. Ou l'alias: transporteur.symphonia-controltower.com"
    Write-Info "  3. Notez le Distribution ID (format: E1234567890ABC)`n"

    Write-Info "Étape 3: Créer une invalidation"
    Write-Info "  1. Cliquez sur le Distribution ID"
    Write-Info "  2. Allez dans l'onglet 'Invalidations'"
    Write-Info "  3. Cliquez sur 'Create invalidation'"
    Write-Info "  4. Dans 'Object paths', entrez:"
    Write-Info "     /*"
    Write-Info "     /_next/static/*"
    Write-Info "     /_next/static/chunks/*"
    Write-Info "  5. Cliquez sur 'Create invalidation'`n"

    Write-Info "Étape 4: Attendre la complétion"
    Write-Info "  1. L'invalidation apparaîtra avec le status 'In Progress'"
    Write-Info "  2. Attendez 5-15 minutes"
    Write-Info "  3. Le status passera à 'Completed'`n"

    Write-Success "`nMÉTHODE 2: Via AWS CLI (Ligne de commande)`n"

    if ([string]::IsNullOrEmpty($DistributionId)) {
        Write-Info "Étape 1: Trouver le Distribution ID"
        Write-Info @"
  aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" --output text

"@
    } else {
        Write-Success "Distribution ID détecté: $DistributionId`n"
    }

    Write-Info "Étape 2: Créer l'invalidation"
    Write-Info @"
  aws cloudfront create-invalidation \
    --distribution-id $(if ($DistributionId) { $DistributionId } else { "E1234567890ABC" }) \
    --paths "/*" "/_next/static/*" "/_next/static/chunks/*"

"@

    Write-Info "Étape 3: Vérifier le statut"
    Write-Info @"
  aws cloudfront get-invalidation \
    --distribution-id $(if ($DistributionId) { $DistributionId } else { "E1234567890ABC" }) \
    --id <INVALIDATION_ID>

"@

    Write-Success "`nMÉTHODE 3: Invalidation ciblée (économique)`n"

    Write-Info "Si vous connaissez le fichier exact à invalider:"
    Write-Info @"
  aws cloudfront create-invalidation \
    --distribution-id $(if ($DistributionId) { $DistributionId } else { "E1234567890ABC" }) \
    --paths "/_next/static/chunks/787220852185cf1e.js"

Note: Les invalidations sont gratuites jusqu'à 1000 chemins par mois.
      Après, c'est $0.005 par chemin invalidé.

"@

    Write-Success "`nMÉTHODE 4: Vérification après invalidation`n"

    Write-Info "1. Tester l'URL directe CloudFront:"
    Write-Info "   https://d3fy85w9zy25oo.cloudfront.net/_next/static/chunks/[hash].js`n"

    Write-Info "2. Tester via le domaine custom:"
    Write-Info "   https://transporteur.symphonia-controltower.com`n"

    Write-Info "3. Vérifier les headers HTTP:"
    Write-Info @"
   curl -I https://transporteur.symphonia-controltower.com/_next/static/chunks/[hash].js

   Recherchez:
   - X-Cache: Miss from cloudfront (première requête après invalidation)
   - X-Cache: Hit from cloudfront (requêtes suivantes)
   - Age: 0 (contenu fraîchement récupéré)

"@

    Write-Info "4. Vider le cache du navigateur:"
    Write-Info "   - Chrome/Edge: Ctrl+Shift+Delete ou Ctrl+Shift+R"
    Write-Info "   - Firefox: Ctrl+Shift+Delete"
    Write-Info "   - Safari: Cmd+Option+E`n"

    Write-Success "`nDÉPANNAGE`n"

    Write-Info "Problème: L'invalidation ne fonctionne pas"
    Write-Info "Solutions:"
    Write-Info "  1. Vérifiez que la distribution est 'Enabled'"
    Write-Info "  2. Attendez la complétion complète (status: Completed)"
    Write-Info "  3. Vérifiez les behaviors de cache dans la distribution"
    Write-Info "  4. Vérifiez les Cache-Control headers de l'origine`n"

    Write-Info "Problème: Permission denied"
    Write-Info "Solutions:"
    Write-Info "  1. Vérifiez vos permissions IAM:"
    Write-Info "     - cloudfront:CreateInvalidation"
    Write-Info "     - cloudfront:GetInvalidation"
    Write-Info "     - cloudfront:ListInvalidations"
    Write-Info "  2. Vérifiez que vous utilisez le bon profil AWS:`n"
    Write-Info "     aws configure list`n"

    Write-Info "Problème: Distribution non trouvée"
    Write-Info "Solutions:"
    Write-Info "  1. Listez toutes les distributions:"
    Write-Info "     .\invalidate-cloudfront-alternative.ps1 -ListDistributions"
    Write-Info "  2. Vérifiez la région AWS (CloudFront est global)"
    Write-Info "  3. Vérifiez que vous avez accès à CloudFront`n"

    Write-Success "`nLIENS UTILES`n"

    Write-Info "Documentation AWS:"
    Write-Info "  - CloudFront Invalidation: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html"
    Write-Info "  - AWS CLI CloudFront: https://docs.aws.amazon.com/cli/latest/reference/cloudfront/index.html"
    Write-Info "  - Pricing: https://aws.amazon.com/cloudfront/pricing/`n"

    Write-Info "Console AWS:"
    if (-not [string]::IsNullOrEmpty($DistributionId)) {
        Write-Info "  - Votre distribution: https://console.aws.amazon.com/cloudfront/v3/home#/distributions/$DistributionId"
    }
    Write-Info "  - CloudFront Home: https://console.aws.amazon.com/cloudfront/v3/home"
    Write-Info "  - IAM Permissions: https://console.aws.amazon.com/iam/home#/users`n"

    Write-Info "============================================================================`n"

    exit 0
}

# ============================================================================
# Par défaut: Afficher l'aide
# ============================================================================
Write-Info "Usage du script:`n"
Write-Info "  # Lister toutes les distributions CloudFront"
Write-Info "  .\invalidate-cloudfront-alternative.ps1 -ListDistributions`n"

Write-Info "  # Lister les invalidations d'une distribution"
Write-Info "  .\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E1234567890ABC`n"

Write-Info "  # Afficher le guide manuel"
Write-Info "  .\invalidate-cloudfront-alternative.ps1 -Manual`n"

Write-Info "  # Afficher le guide manuel avec un Distribution ID spécifique"
Write-Info "  .\invalidate-cloudfront-alternative.ps1 -Manual -DistributionId E1234567890ABC`n"

Write-Info "Pour une invalidation automatique, utilisez:"
Write-Info "  .\invalidate-cloudfront.ps1`n"

Write-Info "============================================================================`n"
