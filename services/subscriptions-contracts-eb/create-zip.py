#!/usr/bin/env python3
"""
Create deployment ZIP for AWS Elastic Beanstalk
Version 2.3.0 - Subscription Guard System
"""

import zipfile
import os
from datetime import datetime

VERSION = "v2.3.0-subscription-guard"

# Liste des fichiers a inclure
FILES = [
    'index.js',
    'package.json',
    'Procfile',
    # Routes
    'account-types-routes.js',
    'auth-routes.js',
    'carrier-referencing-routes.js',
    'ecmr-routes.js',
    'industrial-transport-config-routes.js',
    'pricing-grids-routes.js',
    'stripe-routes.js',
    'transport-orders-routes.js',
    'affretia-routes.js',
    'planning-routes.js',
    'chatbot-routes.js',
    'storage-market-routes.js',
    # Models
    'account-types-models.js',
    'carrier-referencing-models.js',
    'ecmr-models.js',
    'pricing-grids-models.js',
    'transport-orders-models.js',
    'affretia-models.js',
    'planning-models.js',
    'chatbot-models.js',
    'storage-market-models.js',
    # Services
    'carrier-scoring-service.js',
    'dispatch-service.js',
    'document-management-service.js',
    'eta-monitoring-service.js',
    'geofencing-service.js',
    'lane-matching-service.js',
    'ocr-integration-service.js',
    'order-closure-service.js',
    'rdv-management-service.js',
    'tracking-basic-service.js',
    'tomtom-integration.js',
    'notification-service.js',
    'scheduled-jobs.js',
    'helpbot-service.js',
    'affretia-ai-enhancement.js',
    'affretia-service.js',
    'planning-service.js',
    'planning-notification-service.js',
    'planning-websocket.js',
    'planning-ai-optimizer.js',
    'chatbot-service.js',
    'ticketing-service.js',
    'specialized-assistants.js',
    'driver-checkin-service.js',
    'claude-integration.js',
    'storage-market-ai-enhancement.js',
    # Middleware & Utils
    'auth-middleware.js',
    'security-middleware.js',
    'ecmr-pdf.js',
    'ecmr-yousign.js',
    'ecmr-archive.js',
    # Subscription Management System (NEW)
    'subscription-features.js',
    'subscription-guard.middleware.js',
    'subscription-management-routes.js',
]

DIRECTORIES = ['middleware', 'routes', 'integrations', '.ebextensions']

def create_zip():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bundle_dir = os.path.join(base_dir, 'bundle')

    # Creer le dossier bundle s'il n'existe pas
    if not os.path.exists(bundle_dir):
        os.makedirs(bundle_dir)

    output_path = os.path.join(bundle_dir, f'deploy-{VERSION}.zip')

    print('=' * 60)
    print(f'Creating bundle {VERSION}')
    print('=' * 60)
    print()

    included = 0
    missing = 0

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Ajouter les fichiers
        for file in FILES:
            file_path = os.path.join(base_dir, file)
            if os.path.exists(file_path):
                zipf.write(file_path, file)
                print(f'  OK {file}')
                included += 1
            else:
                print(f'  !! {file} (missing)')
                missing += 1

        # Ajouter les dossiers
        for dir_name in DIRECTORIES:
            dir_path = os.path.join(base_dir, dir_name)
            if os.path.exists(dir_path):
                for root, dirs, files in os.walk(dir_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arc_name = os.path.relpath(file_path, base_dir)
                        zipf.write(file_path, arc_name)
                print(f'  OK {dir_name}/')

        # Ajouter node_modules
        node_modules = os.path.join(base_dir, 'node_modules')
        if os.path.exists(node_modules):
            print('  Adding node_modules...')
            for root, dirs, files in os.walk(node_modules):
                for file in files:
                    file_path = os.path.join(root, file)
                    arc_name = os.path.relpath(file_path, base_dir)
                    try:
                        zipf.write(file_path, arc_name)
                    except Exception as e:
                        pass  # Ignorer les erreurs de fichiers individuels
            print('  OK node_modules/')

    # Stats
    file_size = os.path.getsize(output_path)
    print()
    print('=' * 60)
    print('Bundle created successfully!')
    print('=' * 60)
    print(f'File: {output_path}')
    print(f'Size: {file_size / 1024 / 1024:.2f} MB')
    print(f'Files: {included} included, {missing} missing')
    print()
    print('Deploy commands:')
    print(f'  aws s3 cp "{output_path}" s3://elasticbeanstalk-eu-central-1-004843574253/rt-subscriptions-api/{VERSION}.zip')
    print()
    print(f'  aws elasticbeanstalk create-application-version --region eu-central-1 --application-name rt-subscriptions-api --version-label "{VERSION}" --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=rt-subscriptions-api/{VERSION}.zip')
    print()
    print(f'  aws elasticbeanstalk update-environment --region eu-central-1 --environment-name rt-subscriptions-api-prod-v2 --version-label "{VERSION}"')

    return output_path

if __name__ == '__main__':
    create_zip()
