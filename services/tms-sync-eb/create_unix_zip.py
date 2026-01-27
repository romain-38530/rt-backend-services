#!/usr/bin/env python3
"""
Create Unix-compatible ZIP package for AWS Elastic Beanstalk
Converts Windows backslashes to Unix forward slashes
"""

import zipfile
import os
import sys
from pathlib import Path

def create_unix_zip(source_dir, zip_path):
    """Create a ZIP file with Unix-style paths (forward slashes)"""

    print(f"Creating Unix-compatible ZIP from {source_dir}...")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        source_path = Path(source_dir)

        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = Path(root) / file

                # Calculate relative path and convert to Unix style
                relative_path = file_path.relative_to(source_path)
                arcname = str(relative_path).replace('\\', '/')

                zipf.write(file_path, arcname)
                print(f"  Added: {arcname}")

    # Verify the archive
    zip_size = os.path.getsize(zip_path)
    print(f"\n✅ ZIP created successfully!")
    print(f"  Path: {zip_path}")
    print(f"  Size: {zip_size / (1024*1024):.2f} MB")

    # Verify paths are Unix-style
    print(f"\n🔍 Verifying paths...")
    with zipfile.ZipFile(zip_path, 'r') as zipf:
        for name in zipf.namelist()[:5]:  # Show first 5 files
            print(f"  {name}")
            if '\\' in name:
                print(f"  ⚠️  WARNING: Backslash found in {name}")
                return False

    print(f"✅ All paths use forward slashes")
    return True

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python create_unix_zip.py <source_dir> <output_zip>")
        sys.exit(1)

    source_dir = sys.argv[1]
    zip_path = sys.argv[2]

    if not os.path.exists(source_dir):
        print(f"❌ Error: Source directory not found: {source_dir}")
        sys.exit(1)

    success = create_unix_zip(source_dir, zip_path)
    sys.exit(0 if success else 1)
