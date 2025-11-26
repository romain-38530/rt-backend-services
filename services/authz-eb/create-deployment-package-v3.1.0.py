#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Script pour creer le package de deploiement v3.1.0 avec systeme d'emails OVH

import os
import zipfile
import sys

def create_deployment_package():
    print("\n[Package] Creation du package de deploiement authz-eb v3.1.0-with-emails")
    print("=" * 70)

    # Fichiers a inclure
    files_to_include = [
        'index.js',
        'carriers.js',
        'email.js',          # NOUVEAU: Module d'envoi d'emails
        'package.json',
        'Procfile'
    ]

    # Dossiers a inclure
    folders_to_include = [
        'scripts',
        '.ebextensions'
    ]

    # Nom du fichier zip
    zip_filename = 'authz-eb-v3.1.0-with-emails.zip'

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

        print(f"\n[Version] v3.1.0 - Systeme d'envoi d'emails OVH")
        print(f"   [NEW] email.js - Module d'envoi d'emails")
        print(f"   [NEW] 5 types d'emails automatiques")
        print(f"   [UPD] package.json - nodemailer ajoute")
        print(f"   [UPD] carriers.js - integration des emails")

        print(f"\n[Important] Avant le deploiement:")
        print(f"   1. Configurer les variables SMTP dans Elastic Beanstalk")
        print(f"      Configuration > Software > Environment properties")
        print(f"")
        print(f"      SMTP_HOST = ssl0.ovh.net")
        print(f"      SMTP_PORT = 587")
        print(f"      SMTP_SECURE = false")
        print(f"      SMTP_USER = noreply@symphonia.com")
        print(f"      SMTP_PASSWORD = [votre-mot-de-passe]")
        print(f"      SMTP_FROM = noreply@symphonia.com")
        print(f"      FRONTEND_URL = https://main.df8cnylp3pqka.amplifyapp.com")

        print(f"\n[Deploy] Pour deployer sur AWS Elastic Beanstalk:")
        print(f"")
        print(f"   1. Upload sur S3:")
        print(f"      aws s3 cp {zip_filename} ^")
        print(f"        s3://elasticbeanstalk-eu-central-1-004843574253/{zip_filename} ^")
        print(f"        --region eu-central-1")
        print(f"")
        print(f"   2. Creer la version:")
        print(f"      aws elasticbeanstalk create-application-version ^")
        print(f"        --application-name rt-authz-api ^")
        print(f"        --version-label v3.1.0-with-emails ^")
        print(f"        --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key={zip_filename} ^")
        print(f"        --region eu-central-1")
        print(f"")
        print(f"   3. Deployer:")
        print(f"      aws elasticbeanstalk update-environment ^")
        print(f"        --application-name rt-authz-api ^")
        print(f"        --environment-name rt-authz-api-prod ^")
        print(f"        --version-label v3.1.0-with-emails ^")
        print(f"        --region eu-central-1")
        print(f"")

        return 0

    except Exception as e:
        print(f"\n❌ Erreur lors de la création du package: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(create_deployment_package())
