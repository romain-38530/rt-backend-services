try {
    Write-Host "Testing CloudFront HTTPS endpoint..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "https://dgze8l03lwl5h.cloudfront.net/health" -Method Get -TimeoutSec 15

    Write-Host "`nSuccess! MongoDB Status:" -ForegroundColor Green
    Write-Host "Status: $($response.status)" -ForegroundColor White
    Write-Host "MongoDB Configured: $($response.mongodb.configured)" -ForegroundColor White
    Write-Host "MongoDB Connected: $($response.mongodb.connected)" -ForegroundColor White
    Write-Host "MongoDB Status: $($response.mongodb.status)" -ForegroundColor White

    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "`nError connecting to CloudFront: $_" -ForegroundColor Red
    Write-Host "`nTesting HTTP origin directly..." -ForegroundColor Yellow

    try {
        $response = Invoke-RestMethod -Uri "http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health" -Method Get
        Write-Host "`nOrigin HTTP works! MongoDB Status:" -ForegroundColor Green
        Write-Host "MongoDB Connected: $($response.mongodb.connected)" -ForegroundColor White
        $response | ConvertTo-Json -Depth 3
    } catch {
        Write-Host "Origin also failed: $_" -ForegroundColor Red
    }
}
