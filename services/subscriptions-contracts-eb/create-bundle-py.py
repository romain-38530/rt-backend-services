#!/usr/bin/env python3
"""Create deployment bundle for AWS Elastic Beanstalk with Unix paths"""
import os
import zipfile
from pathlib import Path

VERSION = "v4.4.5-pricing-grids-routes-fix"
SOURCE_DIR = Path(__file__).parent
BUNDLE_DIR = SOURCE_DIR / "bundle"
OUTPUT_FILE = BUNDLE_DIR / f"deploy-{VERSION}.zip"

FILES = [
    "index.js",
    "package.json",
    "Procfile",
    "account-types-routes.js",
    "auth-routes.js",
    "carrier-referencing-routes.js",
    "ecmr-routes.js",
    "industrial-transport-config-routes.js",
    "pricing-grids-routes.js",
    "pricing-grids-extended-routes.js",
    "stripe-routes.js",
    "transport-orders-routes.js",
    "affretia-routes.js",
    "planning-routes.js",
    "chatbot-routes.js",
    "storage-market-routes.js",
    "account-types-models.js",
    "carrier-referencing-models.js",
    "ecmr-models.js",
    "pricing-grids-models.js",
    "transport-orders-models.js",
    "affretia-models.js",
    "planning-models.js",
    "chatbot-models.js",
    "storage-market-models.js",
    "carrier-scoring-service.js",
    "dispatch-service.js",
    "document-management-service.js",
    "eta-monitoring-service.js",
    "geofencing-service.js",
    "lane-matching-service.js",
    "ocr-integration-service.js",
    "order-closure-service.js",
    "rdv-management-service.js",
    "tracking-basic-service.js",
    "tomtom-integration.js",
    "notification-service.js",
    "scheduled-jobs.js",
    "helpbot-service.js",
    "affretia-ai-enhancement.js",
    "affretia-service.js",
    "planning-service.js",
    "planning-notification-service.js",
    "planning-websocket.js",
    "planning-ai-optimizer.js",
    "chatbot-service.js",
    "ticketing-service.js",
    "specialized-assistants.js",
    "driver-checkin-service.js",
    "claude-integration.js",
    "storage-market-ai-enhancement.js",
    "auth-middleware.js",
    "security-middleware.js",
    "ecmr-pdf.js",
    "ecmr-yousign.js",
    "ecmr-archive.js",
    "subscription-features.js",
    "subscription-guard.middleware.js",
    "subscription-management-routes.js",
    "logisticien-models.js",
    "logisticien-routes.js",
    "logisticien-portal-routes.js",
    "logisticien-email.js",
    "email-verification-service.js",
    "rate-limiter-middleware.js",
    "invitation-token-service.js",
    "webhook-service.js",
    "two-factor-auth-service.js",
    "aws-ses-email-service.js",
    "security-utils.js",
    "validation-schemas.js",
    "validation-middleware.js",
    "gdpr-service.js",
    "gdpr-routes.js",
    "consent-service.js",
    "secure-logger.js",
    "token-rotation-service.js",
    "websocket-auth-service.js",
    "redis-cache-service.js",
    "driving-time-service.js",
    "carbon-footprint-service.js",
    "error-handler.js",
    "icpe-routes.js",
    "logistics-delegation-routes.js",
    "prospect-carrier-model.js",
    "prospection-service.js",
    "b2p-dashboard-service.js",
    "b2p-dashboard-routes.js",
    "email-ab-testing-service.js",
    "email-ab-testing-routes.js",
]

DIRECTORIES = ["middleware", "routes", "integrations", ".ebextensions"]

def main():
    print(f"\n{'='*60}")
    print(f"Creating bundle {VERSION}")
    print(f"{'='*60}\n")

    # Create bundle directory
    BUNDLE_DIR.mkdir(exist_ok=True)

    # Remove existing zip if present
    if OUTPUT_FILE.exists():
        OUTPUT_FILE.unlink()

    included = 0
    missing = 0

    with zipfile.ZipFile(OUTPUT_FILE, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add individual files
        for filename in FILES:
            filepath = SOURCE_DIR / filename
            if filepath.exists():
                # Use forward slash for Unix compatibility
                zf.write(filepath, filename)
                print(f"  [OK] {filename}")
                included += 1
            else:
                print(f"  [SKIP] {filename}")
                missing += 1

        # Add directories
        for dirname in DIRECTORIES:
            dirpath = SOURCE_DIR / dirname
            if dirpath.exists():
                for root, dirs, files in os.walk(dirpath):
                    for file in files:
                        # Skip disabled and example files
                        if file.endswith('.disabled') or file.endswith('.example'):
                            continue
                        file_path = Path(root) / file
                        # Create Unix-style archive name
                        arcname = file_path.relative_to(SOURCE_DIR).as_posix()
                        zf.write(file_path, arcname)
                print(f"  [OK] {dirname}/")

    file_size = OUTPUT_FILE.stat().st_size / (1024 * 1024)

    print(f"\nSummary: {included} files included, {missing} missing")
    print(f"\n{'='*60}")
    print("Bundle created successfully!")
    print(f"{'='*60}")
    print(f"File: {OUTPUT_FILE}")
    print(f"Size: {file_size:.2f} MB")
    print(f"\nAWS deployment commands:\n")
    print(f"aws s3 cp \"{OUTPUT_FILE}\" s3://elasticbeanstalk-eu-central-1-004843574253/rt-subscriptions-api/{VERSION}.zip")
    print()
    print(f"aws elasticbeanstalk create-application-version --region eu-central-1 --application-name rt-subscriptions-api --version-label {VERSION} --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=rt-subscriptions-api/{VERSION}.zip")
    print()
    print(f"aws elasticbeanstalk update-environment --region eu-central-1 --environment-name rt-subscriptions-api-prod-v3 --version-label {VERSION}")

if __name__ == "__main__":
    main()
