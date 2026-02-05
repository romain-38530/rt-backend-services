#!/usr/bin/env python3
"""Create deployment package for tms-sync-eb"""

import os
import zipfile
import shutil
from pathlib import Path

def create_package():
    print("Creating deployment package v2.4.2...")

    # Package name
    package_name = "rt-tms-sync-api-v2.4.2.zip"

    # Files and directories to include
    includes = [
        "*.js",
        "package.json",
        ".ebextensions",
        ".platform",
        "connectors",
        "services",
        "middlewares"
    ]

    # Create zip
    with zipfile.ZipFile(package_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add JS files in root
        for js_file in Path('.').glob('*.js'):
            print(f"Adding {js_file}")
            zipf.write(js_file)

        # Add package.json
        if Path('package.json').exists():
            print("Adding package.json")
            zipf.write('package.json')

        # Add directories
        for dir_name in ['connectors', 'services', 'middlewares', '.ebextensions', '.platform']:
            dir_path = Path(dir_name)
            if dir_path.exists() and dir_path.is_dir():
                for file_path in dir_path.rglob('*'):
                    if file_path.is_file():
                        print(f"Adding {file_path}")
                        zipf.write(file_path)

    # Get size
    size_kb = os.path.getsize(package_name) / 1024
    print(f"\nPackage created: {package_name}")
    print(f"Size: {size_kb:.2f} KB")
    print("\nNote: This package does NOT include node_modules.")
    print("EB will install dependencies using npm install during deployment.")

if __name__ == "__main__":
    create_package()
