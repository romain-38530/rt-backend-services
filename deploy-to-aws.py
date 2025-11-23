#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Automated deployment script for RT Backend Services to AWS Elastic Beanstalk
"""

import os
import sys
import subprocess
import json

# Fix encoding for Windows console
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def run_command(cmd, cwd=None):
    """Run a command and return the result"""
    print(f"\n>>> Running: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    return result.returncode == 0, result.stdout, result.stderr

def check_prerequisites():
    """Check if AWS CLI and credentials are configured"""
    print("=" * 60)
    print("Checking prerequisites...")
    print("=" * 60)

    # Check AWS CLI
    success, _, _ = run_command("aws --version")
    if not success:
        print("❌ AWS CLI not found")
        return False
    print("✓ AWS CLI found")

    # Check AWS credentials
    success, _, _ = run_command("aws sts get-caller-identity")
    if not success:
        print("❌ AWS credentials not configured")
        return False
    print("✓ AWS credentials OK")

    # Check EB CLI via Python
    try:
        from awsebcli.core import ebcore
        print("✓ EB CLI found")
    except ImportError:
        print("❌ EB CLI not found. Installing...")
        run_command("pip install awsebcli --upgrade")
        try:
            from awsebcli.core import ebcore
            print("✓ EB CLI installed successfully")
        except ImportError:
            print("❌ Failed to install EB CLI")
            return False

    return True

def deploy_service(service_name, service_port, database_name, extra_env=None):
    """Deploy a service to AWS Elastic Beanstalk"""
    print("\n" + "=" * 60)
    print(f"Deploying {service_name} service...")
    print("=" * 60)

    service_dir = f"services/{service_name}-eb"

    if not os.path.exists(service_dir):
        print(f"❌ Service directory not found: {service_dir}")
        return False

    # Change to service directory
    os.chdir(service_dir)

    # Check if .elasticbeanstalk exists
    eb_config_exists = os.path.exists(".elasticbeanstalk")

    if not eb_config_exists:
        print(f"\nInitializing Elastic Beanstalk for {service_name}...")

        # Create EB config
        eb_init_cmd = f'python -m awsebcli.core.ebcore init rt-{service_name}-api --platform "Node.js 20" --region eu-central-1'
        success, _, _ = run_command(eb_init_cmd)

        if not success:
            print(f"❌ Failed to initialize EB for {service_name}")
            return False

        print(f"✓ EB initialized for {service_name}")

        # Create environment
        print(f"\nCreating EB environment for {service_name}...")
        eb_create_cmd = f'python -m awsebcli.core.ebcore create rt-{service_name}-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single'
        success, _, _ = run_command(eb_create_cmd)

        if not success:
            print(f"❌ Failed to create EB environment for {service_name}")
            return False

        print(f"✓ EB environment created for {service_name}")
    else:
        print(f"✓ Using existing EB configuration for {service_name}")

    # Set environment variables
    print(f"\nConfiguring environment variables for {service_name}...")

    env_vars = {
        "MONGODB_URI": f"mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/{database_name}?retryWrites=true&w=majority",
        "PORT": "3000",
        "JWT_SECRET": "rt-jwt-secret-2024-change-in-production",
        "CORS_ALLOWED_ORIGINS": "https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
    }

    # Add extra environment variables
    if extra_env:
        env_vars.update(extra_env)

    # Build setenv command
    env_string = " ".join([f'{k}="{v}"' for k, v in env_vars.items()])
    eb_setenv_cmd = f'python -m awsebcli.core.ebcore setenv {env_string}'

    success, _, _ = run_command(eb_setenv_cmd)

    if not success:
        print(f"⚠️  Warning: Failed to set environment variables for {service_name}")
    else:
        print(f"✓ Environment variables configured for {service_name}")

    # Deploy
    print(f"\nDeploying {service_name} to AWS...")
    eb_deploy_cmd = 'python -m awsebcli.core.ebcore deploy'
    success, stdout, _ = run_command(eb_deploy_cmd)

    if not success:
        print(f"❌ Deployment failed for {service_name}")
        return False

    print(f"✓ {service_name} deployed successfully!")

    # Get status
    print(f"\nGetting status for {service_name}...")
    eb_status_cmd = 'python -m awsebcli.core.ebcore status'
    run_command(eb_status_cmd)

    # Change back to root
    os.chdir("../..")

    return True

def main():
    """Main deployment function"""
    print("\n" + "=" * 60)
    print("RT Backend Services - AWS Deployment")
    print("=" * 60)

    # Check prerequisites
    if not check_prerequisites():
        print("\n❌ Prerequisites check failed")
        sys.exit(1)

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

    print(f"\nServices to deploy: {', '.join([s['name'] for s in services])}")

    response = input("\nProceed with deployment? (yes/no): ")
    if response.lower() != 'yes':
        print("Deployment cancelled")
        sys.exit(0)

    # Deploy each service
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
        status = "✓ Success" if success else "❌ Failed"
        print(f"{service_name}: {status}")

    if all(results.values()):
        print("\n🎉 All services deployed successfully!")
        return 0
    else:
        print("\n⚠️  Some services failed to deploy")
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nDeployment cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
