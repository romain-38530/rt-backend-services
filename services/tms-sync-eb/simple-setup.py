#!/usr/bin/env python3
from pymongo import MongoClient
from datetime import datetime

MONGODB_URI = "mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net/rt-technologie?retryWrites=true&w=majority&appName=StagingRT"
DASHDOC_TOKEN = "8321c7a8f7fe8f75192fa15a6c883a11758e0084"

try:
    client = MongoClient(MONGODB_URI)
    client.admin.command("ping")
    print("Connected to MongoDB")

    db = client["rt-technologie"]
    collection = db["tmsConnections"]

    existing = collection.find_one({"tmsType": "dashdoc"})
    if existing:
        print("Found existing connection: " + str(existing["_id"]))
        print("isActive: " + str(existing.get("isActive")))
        result = collection.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "credentials.apiToken": DASHDOC_TOKEN,
                "credentials.apiUrl": "https://www.dashdoc.eu/api/v4",
                "isActive": True,
                "connectionStatus": "connected",
                "updatedAt": datetime.utcnow()
            }}
        )
        print("Updated: " + str(result.modified_count))
    else:
        print("Creating new connection...")
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
        result = collection.insert_one(new_connection)
        print("Created: " + str(result.inserted_id))

    final = collection.find_one({"tmsType": "dashdoc"})
    print("Final config - ID: " + str(final["_id"]) + ", Active: " + str(final["isActive"]))
    client.close()
    print("SUCCESS - Connection configured!")
except Exception as e:
    print("ERROR: " + str(e))
