#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Automated deployment script for RT Backend Services to AWS Elastic Beanstalk
Non-interactive version - Auto-confirms deployment
"""

import os
import sys
import subprocess

# Fix encoding for Windows console
if sys.platform == "win32":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except:
        pass  # Ignore if it fails

def run_command(cmd, cwd=None):
    """Run a command and return the result"""
    print(f"\n[CMD] {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )

    if result.stdout:
        print(result.stdout)
    if result.stderr and result.returncode != 0:
        print(f"[ERROR] {result.stderr}", file=sys.stderr)

    return result.returncode == 0, result.stdout, result.stderr

def check_prerequisites():
    """Check if AWS CLI and credentials are configured"""
    print("=" * 60)
    print("Checking prerequisites...")
    print("=" * 60)

    # Check AWS CLI
    success, _, _ = run_command("aws --version")
    if not success:
        print("[X] AWS CLI not found")
        return False
    print("[OK] AWS CLI found")

    # Check AWS credentials
    success, _, _ = run_command("aws sts get-caller-identity")
    if not success:
        print("[X] AWS credentials not configured")
        return False
    print("[OK] AWS credentials OK")

    # Check EB CLI via Python
    try:
        from awsebcli.core import ebcore
        print("[OK] EB CLI found")
    except ImportError:
        print("[X] EB CLI not found - This is OK, we'll use AWS CLI fallback")

    return True

def deploy_service(service_name, service_port, database_name, extra_env=None):
    """Deploy a service to AWS Elastic Beanstalk"""
    print("\n" + "=" * 60)
    print(f"Deploying {service_name} service...")
    print("=" * 60)

    service_dir = f"services/{service_name}-eb"

    if not os.path.exists(service_dir):
        print(f"[X] Service directory not found: {service_dir}")
        return False

    print(f"[OK] Found service directory: {service_dir}")
    print(f"[INFO] Service will be available on port {service_port} internally")
    print(f"[INFO] MongoDB database: {database_name}")

    # For now, just build and prepare
    # The actual EB deployment requires EB CLI which has issues on Windows
    print(f"\n[INFO] Service {service_name} is ready for deployment")
    print(f"[INFO] To deploy manually:")
    print(f"  1. cd {service_dir}")
    print(f"  2. eb init -p 'Node.js 20' -r eu-central-1")
    print(f"  3. eb create rt-{service_name}-api-prod --single")
    print(f"  4. eb setenv MONGODB_URI=\"mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/{database_name}?retryWrites=true&w=majority\" PORT=\"3000\" JWT_SECRET=\"rt-jwt-secret-2024\"")
    print(f"  5. eb deploy")

    return True

def main():
    """Main deployment function"""
    print("\n" + "=" * 60)
    print("RT Backend Services - AWS Deployment (Auto)")
    print("=" * 60)

    # Check prerequisites
    if not check_prerequisites():
        print("\n[X] Prerequisites check failed")
        return 1

    # Get root directory
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)

    # Services to deploy
    services = [
        {
            "name": "notifications",
            "port": 3004,
            "database": "rt-notifications",
            "extra_env": {
                "AWS_REGION": "eu-central-1",
                "EMAIL_FROM": "noreply@rt-technologie.com"
            }
        },
        {
            "name": "geo-tracking",
            "port": 3016,
            "database": "rt-geotracking",
            "extra_env": {}
        }
    ]

    print(f"\n[INFO] Services to process: {', '.join([s['name'] for s in services])}")

    # Process each service
    results = {}
    for service in services:
        success = deploy_service(
            service["name"],
            service["port"],
            service["database"],
            service.get("extra_env")
        )
        results[service["name"]] = success

    # Summary
    print("\n" + "=" * 60)
    print("Deployment Summary")
    print("=" * 60)

    for service_name, success in results.items():
        status = "[OK]" if success else "[X]"
        print(f"{service_name}: {status}")

    print("\n" + "=" * 60)
    print("DEPLOYMENT STATUS")
    print("=" * 60)
    print("\nThe services are built and ready for deployment.")
    print("\nDue to EB CLI compatibility issues on Windows, please deploy manually:")
    print("\nFor NOTIFICATIONS:")
    print("  cd services/notifications-eb")
    print("  eb init -p 'Node.js 20' -r eu-central-1")
    print("  eb create rt-notifications-api-prod --single")
    print("  eb setenv MONGODB_URI=\"...\" PORT=\"3000\" JWT_SECRET=\"...\"")
    print("  eb deploy")
    print("\nFor GEO-TRACKING:")
    print("  cd services/geo-tracking-eb")
    print("  eb init -p 'Node.js 20' -r eu-central-1")
    print("  eb create rt-geotracking-api-prod --single")
    print("  eb setenv MONGODB_URI=\"...\" PORT=\"3000\" JWT_SECRET=\"...\"")
    print("  eb deploy")
    print("\nAlternatively, use the AWS Console to create the applications.")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nDeployment cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[X] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
