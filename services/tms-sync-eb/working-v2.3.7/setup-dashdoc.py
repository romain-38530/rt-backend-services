#!/usr/bin/env python3
"""Script to configure Dashdoc connection in MongoDB"""

import sys
from datetime import datetime

try:
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo is not installed")
    print("Install with: pip install pymongo")
    sys.exit(1)

MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"
DASHDOC_TOKEN = "8321c7a8f7fe8f75192fa15a6c883a11758e0084"

def main():
    try:
        print("[1/5] Connecting to MongoDB...")
        client = MongoClient(MONGODB_URI)
        client.admin.command('ping')
        print("[OK] Connected to MongoDB")

        db = client['rt-tms-sync']
        collection = db['tmsConnections']

        print("\n[2/5] Checking for existing Dashdoc connection...")
        existing = collection.find_one({"tmsType": "dashdoc"})

        if existing:
            print("[FOUND] Existing Dashdoc connection:")
            print(f"  - ID: {existing['_id']}")
            print(f"  - Organization: {existing.get('organizationName', 'N/A')}")
            print(f"  - Active: {existing.get('isActive', False)}")
            print(f"  - Status: {existing.get('connectionStatus', 'unknown')}")

            print("\n[3/5] Updating API token...")
            collection.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "credentials.apiToken": DASHDOC_TOKEN,
                        "credentials.apiUrl": "https://www.dashdoc.eu/api/v4",
                        "isActive": True,
                        "connectionStatus": "connected",
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
            print("[OK] Token updated")

        else:
            print("[NOT FOUND] Creating new Dashdoc connection...")

            new_connection = {
                "tmsType": "dashdoc",
                "organizationName": "SYMPHONIA",
                "isActive": True,
                "connectionStatus": "connected",
                "credentials": {
                    "apiToken": DASHDOC_TOKEN,
                    "apiUrl": "https://www.dashdoc.eu/api/v4"
                },
                "syncConfig": {
                    "autoSync": True,
                    "transportLimit": 0,
                    "companyLimit": 0,
                    "contactLimit": 0,
                    "maxPages": 100
                },
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            print("\n[3/5] Inserting new connection...")
            result = collection.insert_one(new_connection)
            print(f"[OK] Connection created with ID: {result.inserted_id}")

        print("\n[4/5] Verifying configuration...")
        final = collection.find_one({"tmsType": "dashdoc"})

        print("\n" + "="*60)
        print("FINAL CONFIGURATION")
        print("="*60)
        print(f"ID:           {final['_id']}")
        print(f"Organization: {final['organizationName']}")
        print(f"Active:       {final['isActive']}")
        print(f"API URL:      {final['credentials']['apiUrl']}")
        print(f"Token:        {final['credentials']['apiToken'][:20]}...")
        print(f"Auto-sync:    {final['syncConfig']['autoSync']}")
        print(f"Max pages:    {final['syncConfig']['maxPages']}")
        print("="*60)

        print("\n[5/5] SUCCESS! Configuration completed.")

        print("\n" + "="*60)
        print("NEXT STEPS")
        print("="*60)
        print("1. Wait ~5 minutes for the automatic carriersSync job")
        print("   OR trigger it manually now:")
        print("")
        print("   curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/carriersSync/run")
        print("")
        print("2. Wait 15-20 minutes for full synchronization")
        print("")
        print("3. Check the result:")
        print("   curl http://rt-tms-sync-api-v2.../api/v1/tms/carriers | jq .total")
        print("   Expected: ~1365 carriers")
        print("="*60)

        client.close()

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
