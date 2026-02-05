#!/usr/bin/env python3
"""Test Dashdoc API pagination"""

import requests
import re

API_TOKEN = "8321c7a8f7fe8f75192fa15a6c883a11758e0084"
API_URL = "https://www.dashdoc.eu/api/v4"

headers = {
    "Authorization": f"Token {API_TOKEN}",
    "Accept": "application/json"
}

def test_pagination():
    all_carriers = []
    page = 1
    max_pages = 100

    print("Test de pagination Dashdoc API...\n")

    while page <= max_pages:
        url = f"{API_URL}/companies/?is_carrier=true&is_shipper=false&limit=500&page={page}"

        print(f"Page {page}...", end=" ")
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            print(f"Erreur: {response.status_code}")
            break

        data = response.json()
        results = data.get('results', [])

        # Filter out clients (C\d+ pattern)
        filtered_results = []
        for c in results:
            remote_id = c.get('remote_id', '')
            if remote_id and re.match(r'^C\d+$', remote_id):
                print(f"[Filtre] {c.get('name')} ({remote_id})", end=" ")
                continue
            filtered_results.append(c)

        all_carriers.extend(filtered_results)

        print(f"{len(results)} carriers, {len(filtered_results)} apres filtre, Total: {len(all_carriers)}/{data.get('count', 'unknown')}")

        # Check if there's a next page
        if not data.get('next'):
            print(f"\nFin de pagination (pas de page suivante)")
            break

        page += 1

    print(f"\n=== RESULTAT ===")
    print(f"Total carriers recuperes: {len(all_carriers)}")
    print(f"Pages parcourues: {page}")

    return all_carriers

if __name__ == "__main__":
    carriers = test_pagination()
