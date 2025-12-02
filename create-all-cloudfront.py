#!/usr/bin/env python3
"""
Script to create CloudFront distributions for all RT Backend Services
"""
import subprocess
import json
import time

# All services that need CloudFront (excluding auth which is already done)
SERVICES = [
    ("authz", "rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com"),
    ("orders", "rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com"),
    ("planning", "rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com"),
    ("planning-sites", "rt-planning-sites-api-prod.eba-uc2vvehf.eu-central-1.elasticbeanstalk.com"),
    ("appointments", "rt-appointments-api-prod.eba-b5rcxvcw.eu-central-1.elasticbeanstalk.com"),
    ("geo-tracking", "rt-geo-tracking-api-prod.eba-3mi2pcfi.eu-central-1.elasticbeanstalk.com"),
    ("tracking", "rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com"),
    ("tms-sync", "rt-tms-sync-api-prod.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com"),
    ("ecmr", "rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com"),
    ("ecmr-signature", "rt-ecmr-signature-api-prod.eba-4pgwbyaj.eu-central-1.elasticbeanstalk.com"),
    ("documents", "rt-documents-api-prod.eba-xscabiv8.eu-central-1.elasticbeanstalk.com"),
    ("palettes", "rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com"),
    ("palettes-circular", "rt-palettes-circular-prod.eba-mqjpbjmp.eu-central-1.elasticbeanstalk.com"),
    ("storage-market", "rt-storage-market-prod.eba-6dcj6yvh.eu-central-1.elasticbeanstalk.com"),
    ("affret-ia", "rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com"),
    ("scoring", "rt-scoring-api-prod.eba-ygb5kqyw.eu-central-1.elasticbeanstalk.com"),
    ("vigilance", "rt-vigilance-api-prod.eba-kmvyig6m.eu-central-1.elasticbeanstalk.com"),
    ("billing", "rt-billing-api-prod.eba-jg9uugnp.eu-central-1.elasticbeanstalk.com"),
    ("subscriptions", "rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com"),
    ("subscriptions-pricing", "rt-subscriptions-pricing-prod.eba-gez7xm2e.eu-central-1.elasticbeanstalk.com"),
    ("notifications", "rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com"),
    ("websocket", "rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com"),
    ("chatbot", "rt-chatbot-api-prod.eba-ecrbeupx.eu-central-1.elasticbeanstalk.com"),
    ("kpi", "rt-kpi-api-prod.eba-sfwqzd4j.eu-central-1.elasticbeanstalk.com"),
    ("training", "rt-training-api-prod.eba-2gaunbjs.eu-central-1.elasticbeanstalk.com"),
    ("sales-agents", "rt-sales-agents-api-prod.eba-kyimfqkb.eu-central-1.elasticbeanstalk.com"),
    ("supplier-space", "rt-supplier-space-prod.eba-ka46t2mz.eu-central-1.elasticbeanstalk.com"),
    ("recipient-space", "rt-recipient-space-prod.eba-xir23y3r.eu-central-1.elasticbeanstalk.com"),
]

def create_cloudfront_config(service_name, origin_domain):
    """Generate CloudFront distribution config"""
    timestamp = int(time.time())
    return {
        "CallerReference": f"rt-{service_name}-cf-{timestamp}",
        "Comment": f"CloudFront HTTPS for RT {service_name} API",
        "Enabled": True,
        "Origins": {
            "Quantity": 1,
            "Items": [{
                "Id": f"rt-{service_name}-origin",
                "DomainName": origin_domain,
                "CustomOriginConfig": {
                    "HTTPPort": 80,
                    "HTTPSPort": 443,
                    "OriginProtocolPolicy": "http-only",
                    "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}
                }
            }]
        },
        "DefaultCacheBehavior": {
            "TargetOriginId": f"rt-{service_name}-origin",
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 7,
                "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
            },
            "ForwardedValues": {
                "QueryString": True,
                "Cookies": {"Forward": "all"},
                "Headers": {
                    "Quantity": 4,
                    "Items": ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method", "Authorization"]
                }
            },
            "MinTTL": 0,
            "DefaultTTL": 0,
            "MaxTTL": 0,
            "Compress": True
        },
        "PriceClass": "PriceClass_100"
    }

def create_distribution(service_name, origin_domain):
    """Create a CloudFront distribution"""
    config = create_cloudfront_config(service_name, origin_domain)
    config_json = json.dumps(config)

    cmd = [
        "aws", "cloudfront", "create-distribution",
        "--distribution-config", config_json,
        "--query", "Distribution.{Id: Id, DomainName: DomainName, Status: Status}",
        "--output", "json"
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {
                "service": service_name,
                "success": True,
                "id": data.get("Id"),
                "domain": data.get("DomainName"),
                "status": data.get("Status")
            }
        else:
            return {
                "service": service_name,
                "success": False,
                "error": result.stderr
            }
    except Exception as e:
        return {
            "service": service_name,
            "success": False,
            "error": str(e)
        }

def main():
    results = []
    print(f"Creating {len(SERVICES)} CloudFront distributions...")
    print("=" * 60)

    for i, (service_name, origin_domain) in enumerate(SERVICES, 1):
        print(f"\n[{i}/{len(SERVICES)}] Creating CloudFront for {service_name}...")
        result = create_distribution(service_name, origin_domain)
        results.append(result)

        if result["success"]:
            print(f"  [OK] Created: {result['domain']}")
            print(f"       ID: {result['id']}")
        else:
            print(f"  [FAIL] {result['error'][:100]}")

        # Small delay to avoid rate limiting
        time.sleep(1)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print(f"\n[SUCCESS] {len(successful)}")
    print(f"[FAILED] {len(failed)}")

    if successful:
        print("\n--- CloudFront URLs ---")
        for r in successful:
            print(f"REACT_APP_{r['service'].upper().replace('-', '_')}_API_URL=https://{r['domain']}")

    # Save results to file
    with open("cloudfront-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to cloudfront-results.json")

if __name__ == "__main__":
    main()
