#!/usr/bin/env python3
"""
Script Python pour créer un ZIP compatible Linux avec des chemins Unix (slashes)
"""
import os
import zipfile
from pathlib import Path

# Configuration
source_dir = r"c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
output_file = r"c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb\deploy-v2.1.5-unix.zip"

# Fichiers et dossiers à inclure
includes = [
    "index.js",
    "package.json",
    "Procfile",
    "scheduled-jobs.js",
    "connectors",
    "services",
    "node_modules"
]

print("Création du package de déploiement avec chemins Unix...")

# Supprimer l'ancien ZIP si existe
if os.path.exists(output_file):
    os.remove(output_file)
    print(f"Ancien package supprimé")

# Créer le ZIP
with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for item in includes:
        item_path = os.path.join(source_dir, item)

        if not os.path.exists(item_path):
            print(f"[WARNING] Non trouve: {item}")
            continue

        if os.path.isfile(item_path):
            # Fichier - utiliser un chemin Unix (slash)
            arcname = item.replace('\\', '/')
            zipf.write(item_path, arcname)
            print(f"[OK] Fichier ajoute: {arcname}")

        elif os.path.isdir(item_path):
            # Dossier - parcourir récursivement
            print(f"[FOLDER] Dossier: {item}/")
            file_count = 0

            for root, dirs, files in os.walk(item_path):
                # Calculer le chemin relatif depuis source_dir
                rel_root = os.path.relpath(root, source_dir)

                for file in files:
                    file_path = os.path.join(root, file)
                    # Convertir en chemin Unix (remplacer \ par /)
                    arcname = os.path.join(rel_root, file).replace('\\', '/')
                    zipf.write(file_path, arcname)
                    file_count += 1

            print(f"   {file_count} fichiers ajoutés")

# Afficher les infos
zip_size = os.path.getsize(output_file)
print(f"\n[SUCCESS] Package cree avec succes!")
print(f"[FILE] Fichier: {output_file}")
print(f"[SIZE] Taille: {zip_size / (1024*1024):.2f} MB")

# Vérifier les chemins dans le ZIP (afficher quelques exemples)
print(f"\n[CHECK] Verification des chemins (echantillon):")
with zipfile.ZipFile(output_file, 'r') as zipf:
    names = zipf.namelist()[:20]  # Premiers 20 fichiers
    for name in names:
        # Vérifier qu'il n'y a pas de backslash
        if '\\' in name:
            print(f"[ERROR] BACKSLASH DETECTE: {name}")
        else:
            print(f"[OK] {name}")

    print(f"\n[TOTAL] Total: {len(zipf.namelist())} fichiers dans le ZIP")
