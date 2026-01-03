import zipfile
import os

source_dir = 'working-extract'
output_file = 'affret-ia-v2.3.3.zip'

with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(source_dir):
        # Exclude node_modules
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        for file in files:
            filepath = os.path.join(root, file)
            # Create arcname relative to source_dir with forward slashes
            arcname = os.path.relpath(filepath, source_dir).replace('\\', '/')
            print(f'Adding: {arcname}')
            zipf.write(filepath, arcname)

print(f'Created: {output_file}')
