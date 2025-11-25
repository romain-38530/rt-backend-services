import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📦 Preparing simple deployment package...');

// Créer le dossier deploy
const deployDir = path.join(__dirname, 'deploy');
if (fs.existsSync(deployDir)) {
  console.log('🗑️  Removing old deploy directory...');
  fs.rmSync(deployDir, { recursive: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// 1. Copier dist/
console.log('✅ Copying dist/');
if (!fs.existsSync(path.join(__dirname, 'dist'))) {
  console.error('❌ dist/ not found. Run pnpm build first!');
  process.exit(1);
}
fs.cpSync(path.join(__dirname, 'dist'), path.join(deployDir, 'dist'), {
  recursive: true,
});

// 2. Build les packages workspace
console.log('🔨 Building workspace packages...');
const workspacePackages = ['contracts', 'utils', 'data-mongo', 'security'];
for (const pkg of workspacePackages) {
  const pkgPath = path.join(__dirname, '..', '..', 'packages', pkg);
  if (fs.existsSync(pkgPath)) {
    console.log(`  Building @rt/${pkg}...`);
    execSync('pnpm build', { cwd: pkgPath, stdio: 'inherit' });
  }
}

// 3. Copier les packages workspace buildés dans node_modules
console.log('✅ Copying built workspace packages to node_modules...');
fs.mkdirSync(path.join(deployDir, 'node_modules', '@rt'), { recursive: true });

for (const pkg of workspacePackages) {
  const pkgPath = path.join(__dirname, '..', '..', 'packages', pkg);
  const distPath = path.join(pkgPath, 'dist');

  if (fs.existsSync(distPath)) {
    const targetPath = path.join(deployDir, 'node_modules', '@rt', pkg);

    // Créer le dossier cible
    fs.mkdirSync(targetPath, { recursive: true });

    // Copier dist/
    fs.cpSync(distPath, targetPath, { recursive: true });

    // Copier package.json
    const pkgJson = path.join(pkgPath, 'package.json');
    if (fs.existsSync(pkgJson)) {
      fs.copyFileSync(pkgJson, path.join(targetPath, 'package.json'));
    }

    console.log(`  Copied @rt/${pkg}`);
  }
}

// 4. Créer package.json de production
console.log('✅ Creating production package.json');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

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
    node: '>=20.0.0',
  },
  dependencies: {
    mongodb: packageJson.dependencies.mongodb,
    pdfkit: packageJson.dependencies.pdfkit,
    nodemailer: packageJson.dependencies.nodemailer,
    express: packageJson.dependencies.express,
    cors: packageJson.dependencies.cors,
    helmet: packageJson.dependencies.helmet,
    'express-rate-limit': packageJson.dependencies['express-rate-limit'],
    dotenv: packageJson.dependencies.dotenv,
    zod: packageJson.dependencies.zod,
  },
};

fs.writeFileSync(
  path.join(deployDir, 'package.json'),
  JSON.stringify(prodPackageJson, null, 2)
);

// 5. Copier .env.example si existe
if (fs.existsSync(path.join(__dirname, '.env.example'))) {
  console.log('✅ Copying .env.example');
  fs.copyFileSync(
    path.join(__dirname, '.env.example'),
    path.join(deployDir, '.env.example')
  );
}

// 6. Créer .ebignore
console.log('✅ Creating .ebignore');
const ebignore = `.git/
.gitignore
*.md
*.log
.env
.env.*
!.env.example
`;
fs.writeFileSync(path.join(deployDir, '.ebignore'), ebignore);

// 7. Copier la configuration EB si elle existe
const ebConfigSource = path.join(__dirname, 'bundle', '.elasticbeanstalk');
if (fs.existsSync(ebConfigSource)) {
  console.log('✅ Copying EB configuration');
  fs.cpSync(ebConfigSource, path.join(deployDir, '.elasticbeanstalk'), {
    recursive: true,
  });
}

// 8. Installer les dépendances npm
console.log('📦 Installing npm dependencies...');
execSync('npm install --production --legacy-peer-deps', {
  cwd: deployDir,
  stdio: 'inherit',
});

console.log('');
console.log('✅ Deployment package ready in ./deploy');
console.log('');
console.log('Next steps:');
console.log('  cd deploy');
console.log('  eb deploy');
