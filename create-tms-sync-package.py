#!/usr/bin/env python3
"""
Create a deployment package for tms-sync-eb service
Creates a clean source bundle - EB will run npm install
"""
import os
import zipfile

def create_deployment_package():
    source_dir = os.path.join(os.path.dirname(__file__), 'services', 'tms-sync-eb')
    output_file = os.path.join(os.path.dirname(__file__), 'tms-sync-eb-v2.6.0-webhooks.zip')

    # Directories to exclude entirely
    exclude_dirs = {
        'node_modules',
        '.git',
        '.elasticbeanstalk',
        'bundle-logs',
        'bundle-logs-deploy-fail',
        'bundle-logs-fixed',
        'working-v2.0.6',
        'working-v2.3.7',
        '__pycache__',
        'coverage',
        '.nyc_output',
    }

    # Files to exclude
    exclude_files = {
        '.DS_Store',
        '.env.local',
        '.env',
        'npm-debug.log',
    }

    # Extensions to exclude
    exclude_extensions = {
        '.pyc',
        '.log',
        '.zip',
        '.tar',
        '.gz',
        '.tgz',
    }

    def should_exclude_dir(dirname):
        return dirname in exclude_dirs or dirname.startswith('.')

    def should_exclude_file(filename):
        if filename in exclude_files:
            return True
        # Check extensions (including compound like .tar.gz)
        lower = filename.lower()
        for ext in exclude_extensions:
            if lower.endswith(ext):
                return True
        return False

    print(f"Creating deployment package from: {source_dir}")
    print(f"Output: {output_file}")

    file_count = 0
    total_size = 0

    with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Filter out excluded directories in place
            dirs[:] = [d for d in dirs if not should_exclude_dir(d)]

            for file in files:
                if should_exclude_file(file):
                    continue

                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)

                try:
                    zipf.write(file_path, arcname)
                    file_count += 1
                    file_size = os.path.getsize(file_path)
                    total_size += file_size

                except Exception as e:
                    print(f"  Warning: Could not add {file_path}: {e}")

    final_size = os.path.getsize(output_file)
    print(f"\nPackage created successfully!")
    print(f"  Files: {file_count}")
    print(f"  Uncompressed: {total_size/1024/1024:.2f} MB")
    print(f"  Compressed: {final_size/1024/1024:.2f} MB")

    # Verify critical files exist
    print("\nVerifying package contents...")
    with zipfile.ZipFile(output_file, 'r') as zf:
        names = zf.namelist()
        critical_files = [
            'package.json',
            'Procfile',
            'index.js',
            'connectors/dashdoc.connector.js',
            'services/dashdoc-datalake/datalake-sync.service.js',
            'models/dashdoc-datalake/index.js',
        ]
        for cf in critical_files:
            if cf in names:
                print(f"  OK: {cf}")
            else:
                print(f"  MISSING: {cf}")

        # Show directories
        dirs_found = set()
        for n in names:
            parts = n.split('/')
            if len(parts) > 1:
                dirs_found.add(parts[0])
        print(f"\nDirectories: {sorted(dirs_found)}")

    return output_file

if __name__ == '__main__':
    create_deployment_package()
