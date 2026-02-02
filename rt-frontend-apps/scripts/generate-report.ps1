# ============================================================================
# Générateur de Rapport - État CloudFront
# ============================================================================
# Génère un rapport complet de l'état actuel de CloudFront et du site
# ============================================================================

param(
    [string]$OutputFile = "cloudfront-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt",
    [switch]$OpenAfter = $false
)

function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }

$report = @()

function Add-ReportSection {
    param([string]$Title, [string]$Content)
    $report += "`n"
    $report += "=" * 80
    $report += "`n  $Title"
    $report += "`n" + ("=" * 80)
    $report += "`n$Content`n"
}

function Add-ReportLine {
    param([string]$Line)
    $report += "$Line`n"
}

Write-Info "`n============================================================================"
Write-Info "  Générateur de Rapport - État CloudFront"
Write-Info "============================================================================`n"

$startTime = Get-Date

# ============================================================================
# En-tête du Rapport
# ============================================================================
$header = @"
RAPPORT D'ÉTAT CLOUDFRONT
Domaine: transporteur.symphonia-controltower.com
CloudFront: d3fy85w9zy25oo.cloudfront.net
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Généré par: $env:USERNAME sur $env:COMPUTERNAME
"@

Add-ReportSection "EN-TÊTE" $header

# ============================================================================
# 1. Configuration AWS
# ============================================================================
Write-Info "[1/8] Vérification de la configuration AWS..."

$awsConfig = ""

try {
    $awsVersion = aws --version 2>&1
    $awsConfig += "AWS CLI Version: $awsVersion`n"

    try {
        $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        $awsConfig += "Account ID: $($identity.Account)`n"
        $awsConfig += "User ARN: $($identity.Arn)`n"
        $awsConfig += "User ID: $($identity.UserId)`n"
        $awsConfig += "Status: ✓ Connecté"
    } catch {
        $awsConfig += "Status: ✗ Credentials invalides"
    }
} catch {
    $awsConfig += "AWS CLI: ✗ Non installé"
}

Add-ReportSection "CONFIGURATION AWS" $awsConfig

# ============================================================================
# 2. Distribution CloudFront
# ============================================================================
Write-Info "[2/8] Récupération de la distribution CloudFront..."

$distConfig = ""

try {
    $distributions = aws cloudfront list-distributions --output json 2>&1 | ConvertFrom-Json
    $target = $distributions.DistributionList.Items | Where-Object { $_.DomainName -eq "d3fy85w9zy25oo.cloudfront.net" }

    if ($target) {
        $distConfig += "Distribution ID: $($target.Id)`n"
        $distConfig += "Domain Name: $($target.DomainName)`n"
        $distConfig += "Status: $($target.Status)`n"
        $distConfig += "Enabled: $($target.Enabled)`n"

        if ($target.Aliases.Items.Count -gt 0) {
            $distConfig += "`nAliases:`n"
            foreach ($alias in $target.Aliases.Items) {
                $distConfig += "  - $alias`n"
            }
        }

        if ($target.Origins.Items.Count -gt 0) {
            $distConfig += "`nOrigins:`n"
            foreach ($origin in $target.Origins.Items) {
                $distConfig += "  - $($origin.DomainName)`n"
            }
        }

        $distConfig += "`nConsole URL:`n"
        $distConfig += "  https://console.aws.amazon.com/cloudfront/v3/home#/distributions/$($target.Id)"

        # Sauvegarder le Distribution ID pour la suite
        $script:distributionId = $target.Id
    } else {
        $distConfig = "✗ Distribution d3fy85w9zy25oo.cloudfront.net non trouvée"
    }
} catch {
    $distConfig = "✗ Erreur lors de la récupération: $($_.Exception.Message)"
}

Add-ReportSection "DISTRIBUTION CLOUDFRONT" $distConfig

# ============================================================================
# 3. Invalidations Récentes
# ============================================================================
Write-Info "[3/8] Récupération des invalidations récentes..."

$invConfig = ""

if ($script:distributionId) {
    try {
        $invalidations = aws cloudfront list-invalidations `
            --distribution-id $script:distributionId `
            --max-items 10 `
            --output json 2>&1 | ConvertFrom-Json

        if ($invalidations.InvalidationList.Items.Count -gt 0) {
            $invConfig += "Nombre d'invalidations récentes: $($invalidations.InvalidationList.Items.Count)`n`n"

            foreach ($inv in $invalidations.InvalidationList.Items) {
                $invConfig += "Invalidation ID: $($inv.Id)`n"
                $invConfig += "  Status: $($inv.Status)`n"
                $invConfig += "  Create Time: $($inv.CreateTime)`n"

                # Récupérer les détails
                try {
                    $details = aws cloudfront get-invalidation `
                        --distribution-id $script:distributionId `
                        --id $inv.Id `
                        --output json 2>&1 | ConvertFrom-Json

                    if ($details.Invalidation.InvalidationBatch.Paths.Items) {
                        $invConfig += "  Paths ($($details.Invalidation.InvalidationBatch.Paths.Quantity)):`n"
                        foreach ($path in $details.Invalidation.InvalidationBatch.Paths.Items) {
                            $invConfig += "    - $path`n"
                        }
                    }
                } catch {}

                $invConfig += "`n"
            }
        } else {
            $invConfig = "Aucune invalidation récente trouvée"
        }
    } catch {
        $invConfig = "✗ Erreur lors de la récupération: $($_.Exception.Message)"
    }
} else {
    $invConfig = "Distribution ID non disponible"
}

Add-ReportSection "INVALIDATIONS RÉCENTES" $invConfig

# ============================================================================
# 4. État du Site Web
# ============================================================================
Write-Info "[4/8] Vérification de l'état du site web..."

$siteStatus = ""

try {
    $response = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com/transporteur" -UseBasicParsing -TimeoutSec 10

    $siteStatus += "URL: https://transporteur.symphonia-controltower.com/transporteur`n"
    $siteStatus += "Status Code: $($response.StatusCode) $($response.StatusDescription)`n"
    $siteStatus += "Content Length: $($response.Content.Length) bytes`n"

    # Headers CloudFront
    if ($response.Headers["X-Cache"]) {
        $siteStatus += "X-Cache: $($response.Headers["X-Cache"])`n"
    }
    if ($response.Headers["Age"]) {
        $siteStatus += "Age: $($response.Headers["Age"]) seconds`n"
    }
    if ($response.Headers["Cache-Control"]) {
        $siteStatus += "Cache-Control: $($response.Headers["Cache-Control"])`n"
    }
    if ($response.Headers["X-Amz-Cf-Pop"]) {
        $siteStatus += "CloudFront POP: $($response.Headers["X-Amz-Cf-Pop"])`n"
    }
    if ($response.Headers["X-Amz-Cf-Id"]) {
        $siteStatus += "CloudFront ID: $($response.Headers["X-Amz-Cf-Id"])`n"
    }

    $siteStatus += "`nStatus: ✓ Site accessible"
} catch {
    $siteStatus += "URL: https://transporteur.symphonia-controltower.com/transporteur`n"
    $siteStatus += "Status: ✗ Site inaccessible`n"
    $siteStatus += "Erreur: $($_.Exception.Message)"
}

Add-ReportSection "ÉTAT DU SITE WEB" $siteStatus

# ============================================================================
# 5. Bundles JavaScript
# ============================================================================
Write-Info "[5/8] Analyse des bundles JavaScript..."

$bundleStatus = ""

try {
    $html = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com/transporteur" -UseBasicParsing -TimeoutSec 10
    $jsFiles = [regex]::Matches($html.Content, '/_next/static/chunks/[a-f0-9]+\.js')

    if ($jsFiles.Count -gt 0) {
        $uniqueBundles = $jsFiles | ForEach-Object { $_.Value } | Select-Object -Unique

        $bundleStatus += "Nombre de bundles trouvés: $($uniqueBundles.Count)`n`n"
        $bundleStatus += "Bundles détectés:`n"

        foreach ($bundle in $uniqueBundles) {
            $bundleHash = [regex]::Match($bundle, '([a-f0-9]+)\.js').Groups[1].Value

            if ($bundle -like "*787220852185cf1e*") {
                $bundleStatus += "  ✗ $bundle (ANCIEN BUNDLE!)`n"
            } else {
                $bundleStatus += "  ✓ $bundle`n"
            }
        }

        # Vérifier si l'ancien bundle est présent
        if ($html.Content -match '787220852185cf1e\.js') {
            $bundleStatus += "`n⚠️ ATTENTION: L'ancien bundle (787220852185cf1e.js) est toujours présent!"
        } else {
            $bundleStatus += "`n✓ L'ancien bundle n'est plus présent"
        }
    } else {
        $bundleStatus = "Aucun bundle JavaScript trouvé dans le HTML"
    }
} catch {
    $bundleStatus = "✗ Erreur lors de l'analyse: $($_.Exception.Message)"
}

Add-ReportSection "BUNDLES JAVASCRIPT" $bundleStatus

# ============================================================================
# 6. Headers d'un Bundle Spécifique
# ============================================================================
Write-Info "[6/8] Vérification des headers d'un bundle..."

$bundleHeaders = ""

try {
    $html = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com/transporteur" -UseBasicParsing -TimeoutSec 10
    $jsFiles = [regex]::Matches($html.Content, '/_next/static/chunks/[a-f0-9]+\.js')

    if ($jsFiles.Count -gt 0) {
        $uniqueBundles = $jsFiles | ForEach-Object { $_.Value } | Select-Object -Unique
        $testBundle = $uniqueBundles[0]
        $bundleUrl = "https://transporteur.symphonia-controltower.com$testBundle"

        $bundleHeaders += "Test URL: $bundleUrl`n`n"

        try {
            $bundleResponse = Invoke-WebRequest -Uri $bundleUrl -Method Head -UseBasicParsing -TimeoutSec 10

            $bundleHeaders += "Status Code: $($bundleResponse.StatusCode)`n"

            if ($bundleResponse.Headers["X-Cache"]) {
                $bundleHeaders += "X-Cache: $($bundleResponse.Headers["X-Cache"])`n"
            }
            if ($bundleResponse.Headers["Age"]) {
                $bundleHeaders += "Age: $($bundleResponse.Headers["Age"]) seconds`n"
            }
            if ($bundleResponse.Headers["Cache-Control"]) {
                $bundleHeaders += "Cache-Control: $($bundleResponse.Headers["Cache-Control"])`n"
            }
            if ($bundleResponse.Headers["ETag"]) {
                $bundleHeaders += "ETag: $($bundleResponse.Headers["ETag"])`n"
            }
            if ($bundleResponse.Headers["Last-Modified"]) {
                $bundleHeaders += "Last-Modified: $($bundleResponse.Headers["Last-Modified"])`n"
            }
            if ($bundleResponse.Headers["Content-Type"]) {
                $bundleHeaders += "Content-Type: $($bundleResponse.Headers["Content-Type"])`n"
            }
            if ($bundleResponse.Headers["Content-Length"]) {
                $bundleHeaders += "Content-Length: $($bundleResponse.Headers["Content-Length"]) bytes`n"
            }
        } catch {
            $bundleHeaders += "✗ Erreur lors de la récupération des headers: $($_.Exception.Message)"
        }
    } else {
        $bundleHeaders = "Aucun bundle à tester"
    }
} catch {
    $bundleHeaders = "✗ Erreur lors de l'analyse: $($_.Exception.Message)"
}

Add-ReportSection "HEADERS DU BUNDLE" $bundleHeaders

# ============================================================================
# 7. Résolution DNS
# ============================================================================
Write-Info "[7/8] Vérification de la résolution DNS..."

$dnsStatus = ""

try {
    $dns = Resolve-DnsName -Name "transporteur.symphonia-controltower.com" -ErrorAction Stop

    $dnsStatus += "Domaine: transporteur.symphonia-controltower.com`n`n"

    foreach ($record in $dns) {
        $dnsStatus += "Type: $($record.Type)`n"
        if ($record.Type -eq "CNAME") {
            $dnsStatus += "  Target: $($record.NameHost)`n"
        } elseif ($record.Type -eq "A") {
            $dnsStatus += "  IP: $($record.IPAddress)`n"
        }
    }

    # Vérifier que ça pointe vers CloudFront
    $pointsToCloudFront = $false
    foreach ($record in $dns) {
        if ($record.Type -eq "CNAME" -and $record.NameHost -like "*cloudfront.net*") {
            $pointsToCloudFront = $true
            break
        }
    }

    if ($pointsToCloudFront) {
        $dnsStatus += "`n✓ Le domaine pointe bien vers CloudFront"
    } else {
        $dnsStatus += "`n⚠️ Le domaine ne semble pas pointer vers CloudFront"
    }
} catch {
    $dnsStatus = "✗ Erreur lors de la résolution DNS: $($_.Exception.Message)"
}

Add-ReportSection "RÉSOLUTION DNS" $dnsStatus

# ============================================================================
# 8. Recommandations
# ============================================================================
Write-Info "[8/8] Génération des recommandations..."

$recommendations = ""

# Analyser les problèmes détectés
$issues = @()

# Vérifier si l'ancien bundle est présent
try {
    $html = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com/transporteur" -UseBasicParsing -TimeoutSec 10
    if ($html.Content -match '787220852185cf1e\.js') {
        $issues += "L'ancien bundle JavaScript (787220852185cf1e.js) est toujours présent"
    }
} catch {}

# Vérifier les invalidations récentes
if ($script:distributionId) {
    try {
        $invalidations = aws cloudfront list-invalidations `
            --distribution-id $script:distributionId `
            --max-items 1 `
            --output json 2>&1 | ConvertFrom-Json

        if ($invalidations.InvalidationList.Items.Count -gt 0) {
            $lastInv = $invalidations.InvalidationList.Items[0]
            if ($lastInv.Status -ne "Completed") {
                $issues += "La dernière invalidation n'est pas encore complète"
            }
        }
    } catch {}
}

# Générer les recommandations
if ($issues.Count -eq 0) {
    $recommendations += "✓ Aucun problème majeur détecté`n`n"
    $recommendations += "Le site semble correctement configuré et à jour.`n`n"
    $recommendations += "Vérifications recommandées:`n"
    $recommendations += "  1. Testez le site dans différents navigateurs`n"
    $recommendations += "  2. Videz le cache du navigateur si nécessaire`n"
    $recommendations += "  3. Vérifiez que toutes les fonctionnalités marchent`n"
} else {
    $recommendations += "⚠️ Problèmes détectés:`n`n"
    foreach ($issue in $issues) {
        $recommendations += "  • $issue`n"
    }

    $recommendations += "`nActions recommandées:`n`n"
    $recommendations += "1. Créer une invalidation CloudFront:`n"
    $recommendations += "   .\quick-invalidate.ps1`n`n"
    $recommendations += "2. Attendre 10-15 minutes pour la propagation`n`n"
    $recommendations += "3. Vérifier la mise à jour:`n"
    $recommendations += "   .\verify-bundle-update.ps1`n`n"
    $recommendations += "4. Si le problème persiste:`n"
    $recommendations += "   - Créer une nouvelle invalidation`n"
    $recommendations += "   - Vérifier la configuration de l'origine Amplify`n"
    $recommendations += "   - Consulter README-CLOUDFRONT-INVALIDATION.md`n"
}

Add-ReportSection "RECOMMANDATIONS" $recommendations

# ============================================================================
# Pied de page
# ============================================================================
$endTime = Get-Date
$duration = $endTime - $startTime

$footer = @"
Rapport généré en $([int]$duration.TotalSeconds) secondes
Fichier: $OutputFile
Date de fin: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

Scripts disponibles:
  - quick-invalidate.ps1              (Invalidation rapide)
  - invalidate-cloudfront.ps1         (Invalidation complète)
  - verify-bundle-update.ps1          (Vérification mise à jour)
  - test-cloudfront-setup.ps1         (Tests configuration)
  - run-complete-workflow.ps1         (Workflow automatique)

Documentation:
  - README-CLOUDFRONT-INVALIDATION.md (Guide complet)
  - INDEX.md                          (Index des scripts)
  - COMMANDS-REFERENCE.md             (Référence commandes)
"@

Add-ReportSection "INFORMATIONS" $footer

# ============================================================================
# Sauvegarder le Rapport
# ============================================================================
Write-Info "`nSauvegarde du rapport..."

try {
    $report | Out-File -FilePath $OutputFile -Encoding utf8
    Write-Success "✓ Rapport sauvegardé: $OutputFile"
    Write-Info "  Taille: $((Get-Item $OutputFile).Length) bytes"

    if ($OpenAfter) {
        Start-Process notepad.exe $OutputFile
        Write-Info "  Rapport ouvert dans Notepad"
    }
} catch {
    Write-Error "✗ Erreur lors de la sauvegarde du rapport"
    Write-Error $_.Exception.Message
}

Write-Info ""
Write-Success "✅ Rapport généré avec succès!`n"
Write-Info "Pour ouvrir le rapport:"
Write-Info "  notepad $OutputFile`n"

exit 0
