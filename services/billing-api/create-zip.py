import zipfile
import os

with zipfile.ZipFile('billing-api-v2.6.0.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d != 'node_modules' and d != '.git' and not d.endswith('.zip')]
        for file in files:
            if not file.endswith('.zip') and not file.endswith('.py'):
                filepath = os.path.join(root, file)
                arcname = filepath[2:] if filepath.startswith('./') else filepath
                arcname = arcname.replace('\\', '/')
                zf.write(filepath, arcname)
                print(f'Added: {arcname}')

print('Done: billing-api-v2.6.0.zip created')
