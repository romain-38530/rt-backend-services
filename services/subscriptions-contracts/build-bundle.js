import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📦 Building bundle for deployment...');

// Clean previous builds
const bundleDir = path.join(__dirname, 'bundle');
if (fs.existsSync(bundleDir)) {
  fs.rmSync(bundleDir, { recursive: true });
}
fs.mkdirSync(bundleDir, { recursive: true });

// Build avec esbuild
try {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: path.join(bundleDir, 'index.js'),
    external: [
      // MongoDB driver natif ne peut pas être bundlé
      'mongodb',
      // Modules natifs
      'pdfkit',
      'nodemailer',
      // Express et dépendances
      'express',
      'cors',
      'helmet',
      'express-rate-limit',
      'dotenv',
      'zod',
    ],
    sourcemap: true,
    minify: false,
    logLevel: 'info',
  });

  console.log('✅ Bundle created successfully');

  // Créer package.json pour production
  console.log('✅ Creating production package.json');

  const originalPkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
  );

  // Extraire seulement les dépendances qu'on a marqué comme external
  const prodDependencies = {
    mongodb: originalPkg.dependencies.mongodb,
    pdfkit: originalPkg.dependencies.pdfkit,
    nodemailer: originalPkg.dependencies.nodemailer,
    express: originalPkg.dependencies.express,
    cors: originalPkg.dependencies.cors,
    helmet: originalPkg.dependencies.helmet,
    'express-rate-limit': originalPkg.dependencies['express-rate-limit'],
    dotenv: originalPkg.dependencies.dotenv,
    zod: originalPkg.dependencies.zod,
  };

  const prodPackageJson = {
    name: 'rt-subscriptions-contracts-api',
    version: originalPkg.version,
    description: originalPkg.description,
    type: 'module',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
    },
    engines: {
      node: '>=20.0.0',
    },
    dependencies: prodDependencies,
  };

  fs.writeFileSync(
    path.join(bundleDir, 'package.json'),
    JSON.stringify(prodPackageJson, null, 2)
  );

  // Créer .ebignore
  console.log('✅ Creating .ebignore');
  const ebignore = `.git/
.gitignore
*.md
*.log
.env
.env.*
!.env.example
node_modules/.cache/
src/
`;
  fs.writeFileSync(path.join(bundleDir, '.ebignore'), ebignore);

  // Créer .elasticbeanstalk/config.yml
  console.log('✅ Creating EB config');
  fs.mkdirSync(path.join(bundleDir, '.elasticbeanstalk'), { recursive: true });
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
    path.join(bundleDir, '.elasticbeanstalk', 'config.yml'),
    ebConfig
  );

  console.log('');
  console.log('✅ Bundle ready in ./bundle');
  console.log('');
  console.log('Next steps:');
  console.log('  1. cd bundle');
  console.log('  2. npm install --production');
  console.log('  3. eb init (if not done)');
  console.log('  4. eb create rt-subscriptions-api-prod --instance-type t3.micro');
  console.log('  5. eb deploy');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
