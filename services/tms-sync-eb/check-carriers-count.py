#!/usr/bin/env python3
"""Check carriers count in MongoDB"""

from pymongo import MongoClient
from datetime import datetime

MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"

def check_carriers():
    print("Connexion a MongoDB...")
    client = MongoClient(MONGODB_URI)

    try:
        client.admin.command('ping')
        print("Connecte a MongoDB\n")

        db = client['rt-tms-sync']
        carriers_collection = db['carriers']

        # Total count
        total_count = carriers_collection.count_documents({})
        print(f"Total carriers dans MongoDB: {total_count}")

        # Dashdoc count
        dashdoc_count = carriers_collection.count_documents({"externalSource": "dashdoc"})
        print(f"   - Dashdoc: {dashdoc_count}")

        # Recent carriers
        print("\nDerniers carriers ajoutes:")
        recent = carriers_collection.find({"externalSource": "dashdoc"}).sort("createdAt", -1).limit(5)
        for i, c in enumerate(recent, 1):
            created_at = c.get('createdAt', 'N/A')
            print(f"   {i}. {c.get('companyName', 'Unknown')} ({c.get('externalId', 'N/A')}) - Cree: {created_at}")

        # Updated carriers
        print("\nCarriers mis a jour recemment:")
        updated = carriers_collection.find({"externalSource": "dashdoc"}).sort("updatedAt", -1).limit(3)
        for i, c in enumerate(updated, 1):
            updated_at = c.get('updatedAt', 'N/A')
            print(f"   {i}. {c.get('companyName', 'Unknown')} - MAJ: {updated_at}")

        client.close()

    except Exception as e:
        print(f"Erreur: {e}")

if __name__ == "__main__":
    check_carriers()
