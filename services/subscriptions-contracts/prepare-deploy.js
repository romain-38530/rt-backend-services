import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📦 Preparing deployment package...');

// Créer le dossier de déploiement
const deployDir = path.join(__dirname, 'deploy');
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// 1. Copier dist/
console.log('✅ Copying dist/');
fs.cpSync(path.join(__dirname, 'dist'), path.join(deployDir, 'dist'), {
  recursive: true,
});

// 2. Copier node_modules/ (seulement les dépendances nécessaires)
console.log('✅ Copying node_modules/');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// Copier les packages workspace buildés
const workspacePackages = ['@rt/contracts', '@rt/utils', '@rt/data-mongo', '@rt/security'];
for (const pkg of workspacePackages) {
  const pkgPath = path.join(__dirname, 'node_modules', pkg);
  if (fs.existsSync(pkgPath)) {
    console.log(`  - ${pkg}`);
    fs.cpSync(pkgPath, path.join(deployDir, 'node_modules', pkg), {
      recursive: true,
    });
  }
}

// Copier les dépendances npm standard
const standardDeps = Object.keys(packageJson.dependencies).filter(
  (dep) => !dep.startsWith('@rt/')
);

for (const dep of standardDeps) {
  const depPath = path.join(__dirname, 'node_modules', dep);
  if (fs.existsSync(depPath)) {
    console.log(`  - ${dep}`);
    fs.cpSync(depPath, path.join(deployDir, 'node_modules', dep), {
      recursive: true,
    });
  }
}

// 3. Créer package.json pour production
console.log('✅ Creating production package.json');
const prodPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  type: 'module',
  main: 'dist/index.js',
  scripts: {
    start: 'node dist/index.js',
  },
  engines: {
    node: '>=18.0.0',
  },
  dependencies: packageJson.dependencies,
};

fs.writeFileSync(
  path.join(deployDir, 'package.json'),
  JSON.stringify(prodPackageJson, null, 2)
);

// 4. Copier .env.example si existe
if (fs.existsSync(path.join(__dirname, '.env.example'))) {
  console.log('✅ Copying .env.example');
  fs.copyFileSync(
    path.join(__dirname, '.env.example'),
    path.join(deployDir, '.env.example')
  );
}

// 5. Créer .ebignore
console.log('✅ Creating .ebignore');
const ebignore = `node_modules/.cache/
*.log
*.md
.git/
.gitignore
src/
tsconfig.json
prepare-deploy.js
`;
fs.writeFileSync(path.join(deployDir, '.ebignore'), ebignore);

// 6. Créer .elasticbeanstalk/config.yml
console.log('✅ Creating EB config');
fs.mkdirSync(path.join(deployDir, '.elasticbeanstalk'), { recursive: true });
const ebConfig = `branch-defaults:
  default:
    environment: rt-subscriptions-api-prod
global:
  application_name: rt-subscriptions-api
  default_region: eu-central-1
  default_platform: Node.js 20
  instance_profile: null
  platform_name: null
  platform_version: null
  profile: null
  sc: null
  workspace_type: Application
`;
fs.writeFileSync(
  path.join(deployDir, '.elasticbeanstalk', 'config.yml'),
  ebConfig
);

console.log('✅ Deployment package ready in ./deploy');
console.log('');
console.log('Next steps:');
console.log('  1. cd deploy');
console.log('  2. eb init (if not done)');
console.log('  3. eb create rt-subscriptions-api-prod --instance-type t3.micro');
console.log('  4. eb deploy');
