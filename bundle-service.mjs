#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { existsSync } from 'fs';
import { join } from 'path';

const serviceName = process.argv[2];
if (!serviceName) {
  console.error('Usage: node bundle-service.mjs <service-name>');
  process.exit(1);
}

const serviceDir = join('services', serviceName);
const outputDir = join('services', `${serviceName}-eb`);
const entryPoint = join(serviceDir, 'src/index.ts');

if (!existsSync(entryPoint)) {
  console.error(`Entry point not found: ${entryPoint}`);
  process.exit(1);
}

console.log(`Bundling ${serviceName}...`);

try {
  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(outputDir, 'dist/index.js'),
    external: [
      // Keep these as external dependencies (will be in node_modules)
      'aws-sdk',
      '@aws-sdk/*',
    ],
    sourcemap: true,
    minify: false,
    banner: {
      js: '// Bundled with esbuild\nimport { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
  });

  console.log(`✓ Bundle created successfully: ${join(outputDir, 'dist/index.js')}`);
} catch (error) {
  console.error('Bundle failed:', error);
  process.exit(1);
}
