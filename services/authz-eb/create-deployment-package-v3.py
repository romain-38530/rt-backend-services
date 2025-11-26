#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Script pour creer le package de deploiement v3.0.0 avec systeme de transporteurs

import os
import zipfile
import sys

def create_deployment_package():
    print("\n[Package] Creation du package de deploiement authz-eb v3.0.0")
    print("=" * 60)

    # Fichiers a inclure
    files_to_include = [
        'index.js',
        'carriers.js',
        'package.json',
        'Procfile'
    ]

    # Dossiers a inclure
    folders_to_include = [
        'scripts',
        '.ebextensions'
    ]

    # Nom du fichier zip
    zip_filename = 'authz-eb-v3.0.0-carrier-system.zip'

    print(f"\n[Files] Creation du fichier: {zip_filename}\n")

    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Ajouter les fichiers individuels
            print("[Add] Ajout des fichiers:")
            for filename in files_to_include:
                if os.path.exists(filename):
                    zipf.write(filename)
                    size = os.path.getsize(filename)
                    print(f"   [OK] {filename} ({size:,} bytes)")
                else:
                    print(f"   [WARN] {filename} (non trouve)")

            # Ajouter les dossiers
            print("\n[Folders] Ajout des dossiers:")
            for folder in folders_to_include:
                if os.path.exists(folder):
                    file_count = 0
                    for root, dirs, files in os.walk(folder):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = file_path
                            zipf.write(file_path, arcname)
                            file_count += 1
                    print(f"   [OK] {folder}/ ({file_count} fichiers)")
                else:
                    print(f"   [WARN] {folder}/ (non trouve)")

        # Afficher la taille du package
        package_size = os.path.getsize(zip_filename)
        size_kb = package_size / 1024

        print(f"\n[SUCCESS] Package cree avec succes!")
        print(f"   [File] Fichier: {zip_filename}")
        print(f"   [Size] Taille: {size_kb:.2f} KB ({package_size:,} bytes)")

        print(f"\n[Deploy] Pour deployer sur AWS Elastic Beanstalk:")
        print(f"   1. Aller sur: https://eu-central-1.console.aws.amazon.com/elasticbeanstalk")
        print(f"   2. Selectionner: rt-authz-api-prod")
        print(f"   3. Upload and Deploy: {zip_filename}\n")

        return 0

    except Exception as e:
        print(f"\n❌ Erreur lors de la création du package: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(create_deployment_package())
