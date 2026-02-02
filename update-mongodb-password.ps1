$region = "eu-central-1"
$newPassword = "Symphonia2024!"
$cluster = "stagingrt.v2jnoh2.mongodb.net"

$environments = @(
    @{ Name = "rt-authz-api-prod"; Database = "rt-authz" },
    @{ Name = "rt-auth-api-prod"; Database = "rt-auth" },
    @{ Name = "rt-orders-api-prod"; Database = "rt-orders" },
    @{ Name = "rt-orders-api-prod-v2"; Database = "rt-orders" },
    @{ Name = "rt-carriers-api-prod"; Database = "rt-carriers" },
    @{ Name = "rt-admin-api-prod"; Database = "rt-admin" },
    @{ Name = "rt-pricing-grids-api-prod"; Database = "rt-pricing-grids" },
    @{ Name = "rt-subscription-invoicing-prod"; Database = "rt-subscriptions" },
    @{ Name = "rt-subscriptions-api-prod-v2"; Database = "rt-subscriptions" },
    @{ Name = "rt-subscriptions-api-prod-v5"; Database = "rt-subscriptions" },
    @{ Name = "rt-subscriptions-pricing-prod"; Database = "rt-subscriptions-pricing" },
    @{ Name = "rt-recipient-space-prod"; Database = "rt-recipient" },
    @{ Name = "rt-supplier-space-prod"; Database = "rt-supplier" },
    @{ Name = "rt-palettes-circular-prod"; Database = "rt-palettes-circular" },
    @{ Name = "rt-palettes-api-prod"; Database = "rt-palettes" },
    @{ Name = "rt-billing-api-prod"; Database = "rt-billing" },
    @{ Name = "rt-kpi-api-prod"; Database = "rt-kpi" },
    @{ Name = "rt-planning-sites-api-prod"; Database = "rt-planning-sites" },
    @{ Name = "rt-planning-api-prod"; Database = "rt-planning" },
    @{ Name = "rt-ecmr-signature-api-prod"; Database = "rt-ecmr-signature" },
    @{ Name = "rt-ecmr-api-prod"; Database = "rt-ecmr" },
    @{ Name = "rt-sales-agents-api-prod"; Database = "rt-sales-agents" },
    @{ Name = "rt-affret-ia-api-prod"; Database = "rt-affret-ia" },
    @{ Name = "rt-affret-ia-api-prod-v4"; Database = "rt-affret-ia" },
    @{ Name = "rt-storage-market-prod"; Database = "rt-storage-market" },
    @{ Name = "rt-storage-market-api-prod"; Database = "rt-storage-market" },
    @{ Name = "rt-websocket-api-prod"; Database = "rt-websocket" },
    @{ Name = "rt-scoring-api-prod"; Database = "rt-scoring" },
    @{ Name = "rt-documents-api-prod"; Database = "rt-documents" },
    @{ Name = "rt-appointments-api-prod"; Database = "rt-appointments" },
    @{ Name = "rt-tracking-api-prod"; Database = "rt-tracking" },
    @{ Name = "rt-chatbot-api-prod"; Database = "rt-chatbot" },
    @{ Name = "rt-training-api-prod"; Database = "rt-training" },
    @{ Name = "rt-vigilance-api-prod"; Database = "rt-vigilance" },
    @{ Name = "rt-geo-tracking-api-prod"; Database = "rt-geo-tracking" },
    @{ Name = "rt-notifications-api-prod"; Database = "rt-notifications" },
    @{ Name = "rt-tms-sync-api-prod"; Database = "rt-tms-sync" },
    @{ Name = "rt-tms-sync-api-v2"; Database = "rt-tms-sync" }
)

Write-Host "Updating MongoDB password on $($environments.Count) environments..."

foreach ($env in $environments) {
    $uri = "mongodb+srv://rt_admin:${newPassword}@${cluster}/$($env.Database)"
    Write-Host "Updating $($env.Name)..."

    $result = aws elasticbeanstalk update-environment --environment-name $env.Name --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value=$uri" --region $region 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: $($env.Name)"
    } else {
        Write-Host "  ERROR: $($env.Name) - $result"
    }
}

Write-Host "Done! Environments will restart automatically."
