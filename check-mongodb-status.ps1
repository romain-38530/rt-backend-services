$region = "eu-central-1"

$apis = @(
    "rt-authz-api-prod",
    "rt-auth-api-prod",
    "rt-orders-api-prod-v2",
    "rt-carriers-api-prod",
    "rt-admin-api-prod",
    "rt-subscriptions-api-prod-v5",
    "rt-billing-api-prod",
    "rt-tracking-api-prod",
    "rt-notifications-api-prod",
    "rt-planning-api-prod",
    "rt-vigilance-api-prod",
    "rt-tms-sync-api-v2",
    "rt-geo-tracking-api-prod",
    "rt-websocket-api-prod",
    "rt-chatbot-api-prod",
    "rt-palettes-api-prod",
    "rt-storage-market-api-prod",
    "rt-training-api-prod"
)

Write-Host "Checking MongoDB connection on $($apis.Count) APIs..." -ForegroundColor Cyan
Write-Host ""

foreach ($apiName in $apis) {
    Write-Host "Checking $apiName... " -NoNewline
    try {
        $cname = aws elasticbeanstalk describe-environments --region $region --environment-names $apiName --query "Environments[0].CNAME" --output text 2>$null
        if ($cname -and $cname -ne "None") {
            $response = Invoke-RestMethod -Uri "http://$cname/health" -TimeoutSec 10

            # Check various mongodb status formats
            $mongoStatus = $null
            if ($response.mongodb.connected -eq $true) {
                $mongoStatus = "CONNECTED"
            } elseif ($response.mongodb.status -eq "active") {
                $mongoStatus = "CONNECTED"
            } elseif ($response.mongodb -eq "connected") {
                $mongoStatus = "CONNECTED"
            } elseif ($response.checks.mongodb.status -eq "healthy") {
                $mongoStatus = "CONNECTED"
            } elseif ($response.status -eq "healthy" -or $response.status -eq "ok") {
                $mongoStatus = "OK (no mongo details)"
            } else {
                $mongoStatus = "UNKNOWN"
            }

            if ($mongoStatus -eq "CONNECTED") {
                Write-Host $mongoStatus -ForegroundColor Green
            } elseif ($mongoStatus -like "OK*") {
                Write-Host $mongoStatus -ForegroundColor Yellow
            } else {
                Write-Host $mongoStatus -ForegroundColor Red
            }
        } else {
            Write-Host "ENV NOT FOUND" -ForegroundColor Red
        }
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
