#!/usr/bin/env python3
"""
RT Backend Services - Production Monitoring Agent
Surveille l'etat de sante de tous les services SYMPHONI.A
"""
import subprocess
import json
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# All services with their CloudFront HTTPS endpoints
SERVICES = {
    "Auth API": "https://d2swp5s4jfg8ri.cloudfront.net",
    "Authz API": "https://ddaywxps9n701.cloudfront.net",
    "Orders API": "https://dh9acecfz0wg0.cloudfront.net",
    "Planning API": "https://dpw23bg2dclr1.cloudfront.net",
    "Planning Sites API": "https://dyb8rmhhukzt6.cloudfront.net",
    "Appointments API": "https://d28uezz0327lfm.cloudfront.net",
    "Geo Tracking API": "https://du5xhabwwbfp9.cloudfront.net",
    "Tracking API": "https://d2mn43ccfvt3ub.cloudfront.net",
    "TMS Sync API": "https://d1yk7yneclf57m.cloudfront.net",
    "eCMR API": "https://d28q05cx5hmg9q.cloudfront.net",
    "eCMR Signature API": "https://d2ehvhc99fi3bj.cloudfront.net",
    "Documents API": "https://d8987l284s9q4.cloudfront.net",
    "Palettes API": "https://d2o4ng8nutcmou.cloudfront.net",
    "Palettes Circular API": "https://djlfoe9zmrj66.cloudfront.net",
    "Storage Market API": "https://d1ea8wbaf6ws9i.cloudfront.net",
    "Affret IA API": "https://d393yiia4ig3bw.cloudfront.net",
    "Scoring API": "https://d1uyscmpcwc65a.cloudfront.net",
    "Vigilance API": "https://d23m3oa6ef3tr1.cloudfront.net",
    "Billing API": "https://d1ciol606nbfs0.cloudfront.net",
    "Subscriptions API": "https://d39uizi9hzozo8.cloudfront.net",
    "Subscriptions Pricing API": "https://d35kjzzin322yz.cloudfront.net",
    "Notifications API": "https://d2t9age53em7o5.cloudfront.net",
    "WebSocket API": "https://d2aodzk1jwptdr.cloudfront.net",
    "Chatbot API": "https://de1913kh0ya48.cloudfront.net",
    "KPI API": "https://d57lw7v3zgfpy.cloudfront.net",
    "Training API": "https://d39f1h56c4jwz4.cloudfront.net",
    "Sales Agents API": "https://d3tr75b4e76icu.cloudfront.net",
    "Supplier Space API": "https://d2wctqqghsi65l.cloudfront.net",
    "Recipient Space API": "https://d1evvlmqvhcz4f.cloudfront.net",
    "Subscription Invoicing API": "https://d1zeelzdka3pib.cloudfront.net",
}

def check_service(name, url):
    """Check health of a single service"""
    health_url = f"{url}/health"
    try:
        result = subprocess.run(
            ["curl", "-s", "--ssl-no-revoke", "-m", "10", health_url],
            capture_output=True,
            text=True,
            timeout=15
        )

        if result.returncode == 0 and result.stdout:
            try:
                data = json.loads(result.stdout)
                status = data.get("status", "unknown")
                version = data.get("version", "N/A")

                # Handle mongodb field (can be string or object)
                mongodb_field = data.get("mongodb", "N/A")
                if isinstance(mongodb_field, dict):
                    mongodb = mongodb_field.get("status", "N/A")
                elif isinstance(mongodb_field, str):
                    mongodb = mongodb_field
                else:
                    mongodb = "N/A"

                return {
                    "name": name,
                    "url": url,
                    "healthy": status in ["healthy", "ok"],
                    "status": status,
                    "version": version,
                    "mongodb": mongodb,
                    "response_time": "OK",
                    "error": None
                }
            except json.JSONDecodeError:
                # Not JSON but got a response
                return {
                    "name": name,
                    "url": url,
                    "healthy": True,
                    "status": "responding",
                    "version": "N/A",
                    "mongodb": "N/A",
                    "response_time": "OK",
                    "error": None
                }
        else:
            return {
                "name": name,
                "url": url,
                "healthy": False,
                "status": "error",
                "version": "N/A",
                "mongodb": "N/A",
                "response_time": "TIMEOUT",
                "error": result.stderr[:100] if result.stderr else "No response"
            }
    except Exception as e:
        return {
            "name": name,
            "url": url,
            "healthy": False,
            "status": "error",
            "version": "N/A",
            "mongodb": "N/A",
            "response_time": "ERROR",
            "error": str(e)[:100]
        }

def test_login():
    """Test login functionality"""
    try:
        # Create a temp file with JSON payload
        payload = '{"email":"demo@agrofrance.fr","password":"Demo2024!"}'
        result = subprocess.run(
            ["curl", "-s", "--ssl-no-revoke", "-m", "10",
             "-X", "POST",
             "-H", "Content-Type: application/json",
             "-d", payload,
             "https://d2swp5s4jfg8ri.cloudfront.net/api/auth/login"],
            capture_output=True,
            text=True,
            timeout=15
        )

        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            if data.get("token"):
                return {"success": True, "message": "Login OK", "user": data.get("user", {}).get("email")}
            else:
                return {"success": False, "message": data.get("message", "No token")}
        return {"success": False, "message": "No response"}
    except Exception as e:
        return {"success": False, "message": str(e)[:50]}

def main():
    print("=" * 70)
    print("  RT BACKEND SERVICES - PRODUCTION MONITOR")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    results = []

    # Check all services in parallel
    print("\n[1/2] Checking service health endpoints...")
    print("-" * 70)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_service, name, url): name
                   for name, url in SERVICES.items()}

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

            # Print status
            status_icon = "[OK]" if result["healthy"] else "[FAIL]"
            print(f"  {status_icon:6} {result['name']:25} v{result['version']:8} DB:{result['mongodb']}")

    # Summary
    healthy = [r for r in results if r["healthy"]]
    unhealthy = [r for r in results if not r["healthy"]]

    print("\n" + "-" * 70)
    print(f"  Services: {len(healthy)}/{len(results)} healthy")

    if unhealthy:
        print("\n  [!] UNHEALTHY SERVICES:")
        for r in unhealthy:
            print(f"      - {r['name']}: {r['error']}")

    # Test login
    print("\n[2/2] Testing authentication...")
    print("-" * 70)
    login_result = test_login()
    if login_result["success"]:
        print(f"  [OK]   Login test passed ({login_result.get('user', 'N/A')})")
    else:
        print(f"  [FAIL] Login test failed: {login_result['message']}")

    # Final status
    print("\n" + "=" * 70)
    all_ok = len(unhealthy) == 0 and login_result["success"]

    if all_ok:
        print("  STATUS: ALL SYSTEMS OPERATIONAL")
    else:
        print("  STATUS: ISSUES DETECTED")
        print(f"  - Unhealthy services: {len(unhealthy)}")
        print(f"  - Login test: {'PASS' if login_result['success'] else 'FAIL'}")

    print("=" * 70)

    # Save report
    report = {
        "timestamp": datetime.now().isoformat(),
        "total_services": len(results),
        "healthy_count": len(healthy),
        "unhealthy_count": len(unhealthy),
        "login_test": login_result,
        "services": results
    }

    with open("monitor-report.json", "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nReport saved to: monitor-report.json")

    # Exit code for CI/CD
    sys.exit(0 if all_ok else 1)

if __name__ == "__main__":
    main()
