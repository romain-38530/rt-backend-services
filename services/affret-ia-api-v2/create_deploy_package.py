#!/usr/bin/env python3
"""
Script pour créer un package déployable Affret.IA v2.4.0
avec chemins Unix correctement formatés
"""

import zipfile
import os
from pathlib import Path

def create_deployment_package():
    source_dir = Path(__file__).parent
    zip_path = source_dir / "deploy-v2.4.0-unix.zip"

    print(f"Creating Affret.IA deployment package v2.4.0...")
    print(f"Source directory: {source_dir}")

    # Supprimer l'ancien ZIP
    if zip_path.exists():
        zip_path.unlink()
        print(f"Removed old ZIP: {zip_path}")

    # Liste des fichiers/dossiers à inclure
    files_to_include = [
        "index.js",
        "package.json",
        "Procfile",
        "controllers",
        "routes",
        "services",
        "models",
    ]

    # Créer le ZIP
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for item in files_to_include:
            item_path = source_dir / item

            if not item_path.exists():
                print(f"Warning: {item} not found, skipping...")
                continue

            if item_path.is_file():
                # Ajouter un fichier avec chemin Unix
                arcname = item.replace('\\', '/')
                zipf.write(item_path, arcname)
                print(f"  [OK] {arcname}")

            elif item_path.is_dir():
                # Ajouter tous les fichiers d'un dossier
                for root, dirs, files in os.walk(item_path):
                    # Ignorer node_modules, .git, etc.
                    dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', '__pycache__']]

                    for file in files:
                        if file.endswith(('.pyc', '.log', '.env')):
                            continue

                        file_path = Path(root) / file
                        # Calculer le chemin relatif avec des slashes Unix
                        rel_path = file_path.relative_to(source_dir)
                        arcname = str(rel_path).replace('\\', '/')
                        zipf.write(file_path, arcname)

                print(f"  [OK] {item}/ (directory)")

    # Résumé
    print(f"\nPackage created successfully!")
    print(f"  Path: {zip_path}")
    print(f"  Size: {zip_path.stat().st_size / 1024:.2f} KB")

    # Lister le contenu
    print(f"\nZIP contents:")
    with zipfile.ZipFile(zip_path, 'r') as zipf:
        for info in zipf.infolist()[:20]:
            print(f"  {info.filename}")
        if len(zipf.infolist()) > 20:
            print(f"  ... and {len(zipf.infolist()) - 20} more files")

if __name__ == "__main__":
    create_deployment_package()
