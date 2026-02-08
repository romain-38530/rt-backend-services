import zipfile
import os

version = '3.0.0'
zip_path = f'authz-eb-v{version}-subusers.zip'
source_dir = 'working-version'

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    # Add main files
    for filename in ['index.js', 'package.json', 'Procfile']:
        src_path = os.path.join(source_dir, filename)
        if os.path.exists(src_path):
            zf.write(src_path, filename)
            print(f'Added: {filename}')
        else:
            print(f'WARNING: {filename} not found')

print(f'Created {zip_path}')
print(f'Size: {os.path.getsize(zip_path) / 1024:.2f} KB')
