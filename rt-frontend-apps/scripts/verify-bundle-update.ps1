# ============================================================================
# Script de Vérification - Mise à jour du Bundle JavaScript
# ============================================================================
# Vérifie que le nouveau bundle JavaScript est bien servi après invalidation
# ============================================================================

param(
    [string]$Domain = "transporteur.symphonia-controltower.com",
    [string]$OldBundle = "787220852185cf1e.js",
    [switch]$Verbose = $false
)

function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }

Write-Info "`n============================================================================"
Write-Info "  Vérification de la Mise à Jour du Bundle JavaScript"
Write-Info "============================================================================`n"

Write-Info "Domaine: https://$Domain"
Write-Info "Ancien bundle: $OldBundle"
Write-Info ""

# ============================================================================
# 1. Vérifier l'accessibilité du site
# ============================================================================
Write-Info "[1/5] Vérification de l'accessibilité du site..."

try {
    $response = Invoke-WebRequest -Uri "https://$Domain/transporteur" -UseBasicParsing -TimeoutSec 10
    Write-Success "✓ Site accessible (Status: $($response.StatusCode))"

    # Vérifier les headers CloudFront
    if ($response.Headers["X-Cache"]) {
        $xCache = $response.Headers["X-Cache"]
        Write-Info "  X-Cache: $xCache"

        if ($xCache -like "*Miss*") {
            Write-Success "  → Cache Miss détecté (bon signe après invalidation)"
        } elseif ($xCache -like "*Hit*") {
            Write-Warning "  → Cache Hit (normal si l'invalidation est terminée)"
        }
    }

    if ($response.Headers["Age"]) {
        $age = $response.Headers["Age"]
        Write-Info "  Age: $age secondes"

        if ([int]$age -lt 300) {
            Write-Success "  → Contenu récent (< 5 minutes)"
        }
    }

} catch {
    Write-Error "✗ Impossible d'accéder au site"
    Write-Error $_.Exception.Message
    exit 1
}

# ============================================================================
# 2. Récupérer le HTML de la page
# ============================================================================
Write-Info "`n[2/5] Récupération du HTML de la page..."

try {
    $html = Invoke-WebRequest -Uri "https://$Domain/transporteur" -UseBasicParsing -TimeoutSec 10
    Write-Success "✓ HTML récupéré ($($html.Content.Length) caractères)"
} catch {
    Write-Error "✗ Impossible de récupérer le HTML"
    Write-Error $_.Exception.Message
    exit 1
}

# ============================================================================
# 3. Analyser les bundles JavaScript
# ============================================================================
Write-Info "`n[3/5] Analyse des bundles JavaScript..."

# Extraire tous les fichiers .js
$jsFiles = [regex]::Matches($html.Content, '/_next/static/chunks/[a-f0-9]+\.js')

if ($jsFiles.Count -eq 0) {
    Write-Warning "⚠ Aucun bundle JavaScript trouvé dans le HTML"
    Write-Warning "  Le site utilise peut-être un chargement différé"
} else {
    Write-Success "✓ $($jsFiles.Count) bundles JavaScript trouvés"

    # Déduplication
    $uniqueBundles = $jsFiles | ForEach-Object { $_.Value } | Select-Object -Unique

    Write-Info "`n  Bundles détectés:"
    foreach ($bundle in $uniqueBundles) {
        $bundleHash = [regex]::Match($bundle, '([a-f0-9]+)\.js').Groups[1].Value

        if ($bundle -like "*$OldBundle*") {
            Write-Error "    ✗ $bundle (ANCIEN BUNDLE DÉTECTÉ!)"
            $oldBundleFound = $true
        } else {
            Write-Success "    ✓ $bundle"
        }
    }

    # Résumé
    Write-Info ""
    if ($oldBundleFound) {
        Write-Error "❌ L'ancien bundle ($OldBundle) est toujours présent!"
        Write-Warning "`nActions recommandées:"
        Write-Warning "  1. Vérifiez que l'invalidation CloudFront est complète"
        Write-Warning "  2. Attendez 5-15 minutes supplémentaires"
        Write-Warning "  3. Videz le cache de votre navigateur"
        Write-Warning "  4. Relancez ce script"
    } else {
        Write-Success "✓ L'ancien bundle n'est plus présent"
    }
}

# ============================================================================
# 4. Vérifier les headers d'un bundle spécifique
# ============================================================================
Write-Info "`n[4/5] Vérification des headers d'un bundle..."

if ($uniqueBundles.Count -gt 0) {
    $testBundle = $uniqueBundles[0]
    $bundleUrl = "https://$Domain$testBundle"

    Write-Info "  URL de test: $bundleUrl"

    try {
        $bundleResponse = Invoke-WebRequest -Uri $bundleUrl -Method Head -UseBasicParsing -TimeoutSec 10

        Write-Success "  ✓ Bundle accessible"
        Write-Info "  Status: $($bundleResponse.StatusCode)"

        if ($bundleResponse.Headers["X-Cache"]) {
            Write-Info "  X-Cache: $($bundleResponse.Headers["X-Cache"])"
        }

        if ($bundleResponse.Headers["Age"]) {
            Write-Info "  Age: $($bundleResponse.Headers["Age"]) secondes"
        }

        if ($bundleResponse.Headers["Cache-Control"]) {
            Write-Info "  Cache-Control: $($bundleResponse.Headers["Cache-Control"])"
        }

        if ($bundleResponse.Headers["ETag"]) {
            Write-Info "  ETag: $($bundleResponse.Headers["ETag"])"
        }

        if ($bundleResponse.Headers["Last-Modified"]) {
            $lastModified = $bundleResponse.Headers["Last-Modified"]
            Write-Info "  Last-Modified: $lastModified"

            # Vérifier si c'est récent
            try {
                $lastModifiedDate = [DateTime]::ParseExact($lastModified, "ddd, dd MMM yyyy HH:mm:ss 'GMT'", [System.Globalization.CultureInfo]::InvariantCulture)
                $age = (Get-Date) - $lastModifiedDate
                if ($age.TotalHours -lt 24) {
                    Write-Success "  → Modifié il y a $([int]$age.TotalHours) heures (récent!)"
                } else {
                    Write-Info "  → Modifié il y a $([int]$age.TotalDays) jours"
                }
            } catch {}
        }

    } catch {
        Write-Warning "  ⚠ Impossible de récupérer les headers du bundle"
        if ($Verbose) {
            Write-Warning $_.Exception.Message
        }
    }
} else {
    Write-Warning "⚠ Aucun bundle à tester"
}

# ============================================================================
# 5. Vérifier la distribution CloudFront
# ============================================================================
Write-Info "`n[5/5] Vérification de la distribution CloudFront..."

try {
    # Vérifier si AWS CLI est disponible
    $null = Get-Command aws -ErrorAction Stop

    # Trouver le Distribution ID
    $distId = aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" --output text 2>&1

    if ([string]::IsNullOrWhiteSpace($distId) -or $distId -like "*error*") {
        Write-Warning "⚠ Impossible de récupérer le Distribution ID"
        Write-Info "  Vérifiez vos credentials AWS"
    } else {
        Write-Success "✓ Distribution ID: $distId"

        # Lister les invalidations récentes
        $invalidations = aws cloudfront list-invalidations --distribution-id $distId --max-items 3 --output json 2>&1 | ConvertFrom-Json

        if ($invalidations.InvalidationList.Items.Count -gt 0) {
            Write-Info "`n  Invalidations récentes:"
            foreach ($inv in $invalidations.InvalidationList.Items) {
                $statusIcon = if ($inv.Status -eq "Completed") { "✓" } else { "⏳" }
                Write-Info "    $statusIcon $($inv.Id) - $($inv.Status) - $($inv.CreateTime)"
            }

            # Vérifier la dernière invalidation
            $lastInv = $invalidations.InvalidationList.Items[0]
            if ($lastInv.Status -eq "Completed") {
                Write-Success "`n  ✓ Dernière invalidation complète"

                # Vérifier l'âge de l'invalidation
                try {
                    $createTime = [DateTime]::Parse($lastInv.CreateTime)
                    $age = (Get-Date) - $createTime
                    Write-Info "    Complétée il y a $([int]$age.TotalMinutes) minutes"

                    if ($age.TotalMinutes -lt 30) {
                        Write-Success "    → Invalidation très récente"
                    }
                } catch {}
            } else {
                Write-Warning "`n  ⏳ Dernière invalidation en cours..."
                Write-Info "    Attendez quelques minutes et relancez ce script"
            }
        } else {
            Write-Info "  Aucune invalidation récente trouvée"
        }
    }

} catch {
    Write-Warning "⚠ AWS CLI non disponible ou non configuré"
    Write-Info "  Installez AWS CLI pour plus d'informations: https://aws.amazon.com/cli/"
}

# ============================================================================
# Résumé Final
# ============================================================================
Write-Info "`n============================================================================"
Write-Info "  Résumé de la Vérification"
Write-Info "============================================================================`n"

$issues = @()

if ($oldBundleFound) {
    $issues += "L'ancien bundle est toujours présent"
}

if ($issues.Count -eq 0) {
    Write-Success "✅ SUCCÈS - Le site semble correctement mis à jour!"
    Write-Info ""
    Write-Info "Actions recommandées:"
    Write-Info "  1. Testez le site dans votre navigateur"
    Write-Info "  2. Videz le cache du navigateur (Ctrl+Shift+R)"
    Write-Info "  3. Vérifiez que toutes les fonctionnalités marchent"
    Write-Info ""
} else {
    Write-Error "❌ PROBLÈMES DÉTECTÉS"
    Write-Info ""
    Write-Info "Problèmes:"
    foreach ($issue in $issues) {
        Write-Error "  • $issue"
    }
    Write-Info ""
    Write-Info "Actions recommandées:"
    Write-Info "  1. Vérifiez que l'invalidation CloudFront est complète:"
    Write-Info "     .\invalidate-cloudfront.ps1"
    Write-Info ""
    Write-Info "  2. Si l'invalidation est complète, créez-en une nouvelle:"
    Write-Info "     .\quick-invalidate.ps1"
    Write-Info ""
    Write-Info "  3. Attendez 15 minutes et relancez ce script:"
    Write-Info "     .\verify-bundle-update.ps1"
    Write-Info ""
    Write-Info "  4. Consultez le README pour plus de solutions:"
    Write-Info "     README-CLOUDFRONT-INVALIDATION.md"
    Write-Info ""
}

Write-Info "Pour plus de détails, exécutez avec -Verbose:"
Write-Info "  .\verify-bundle-update.ps1 -Verbose"
Write-Info ""
Write-Info "============================================================================`n"

# Retourner le code de sortie
exit $(if ($issues.Count -eq 0) { 0 } else { 1 })
