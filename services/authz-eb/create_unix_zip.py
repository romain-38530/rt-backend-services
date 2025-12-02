import zipfile
import os

output = 'authz-eb-v3.5.2-unix.zip'
source = 'deploy-temp'

with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(source):
        for file in files:
            file_path = os.path.join(root, file)
            # Create archive name with forward slashes and remove source prefix
            arcname = os.path.relpath(file_path, source).replace('\\', '/')
            print(f'Adding: {arcname}')
            zf.write(file_path, arcname)

print(f'Created {output}')
