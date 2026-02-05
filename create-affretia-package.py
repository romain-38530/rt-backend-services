#!/usr/bin/env python3
"""
Create a deployment package for affret-ia-api-v2 service
"""
import os
import zipfile

def create_deployment_package():
    source_dir = os.path.join(os.path.dirname(__file__), 'services', 'affret-ia-api-v2')
    output_file = os.path.join(os.path.dirname(__file__), 'affret-ia-v2.9.10-carriers-routes.zip')

    exclude_dirs = {
        'node_modules', '.git', '.elasticbeanstalk', '__pycache__',
        'coverage', '.nyc_output', 'logs', 'temp'
    }

    exclude_files = {'.DS_Store', '.env.local', '.env', 'npm-debug.log'}
    exclude_extensions = {'.pyc', '.log', '.zip', '.tar', '.gz', '.tgz'}

    def should_exclude_dir(dirname):
        return dirname in exclude_dirs or dirname.startswith('.')

    def should_exclude_file(filename):
        if filename in exclude_files:
            return True
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
            dirs[:] = [d for d in dirs if not should_exclude_dir(d)]

            for file in files:
                if should_exclude_file(file):
                    continue

                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)

                try:
                    zipf.write(file_path, arcname)
                    file_count += 1
                    total_size += os.path.getsize(file_path)
                except Exception as e:
                    print(f"  Warning: Could not add {file_path}: {e}")

    final_size = os.path.getsize(output_file)
    print(f"\nPackage created!")
    print(f"  Files: {file_count}")
    print(f"  Compressed: {final_size/1024/1024:.2f} MB")

    # Verify critical files
    print("\nVerifying package contents...")
    with zipfile.ZipFile(output_file, 'r') as zf:
        names = zf.namelist()
        critical_files = ['package.json', 'Procfile', 'index.js', 'services/pricing.service.js']
        for cf in critical_files:
            if cf in names:
                print(f"  OK: {cf}")
            else:
                print(f"  MISSING: {cf}")

    return output_file

if __name__ == '__main__':
    create_deployment_package()
