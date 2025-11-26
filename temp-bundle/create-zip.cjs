// Script pour créer un ZIP compatible AWS EB
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.join(__dirname, 'extracted');
const outputFile = path.join(__dirname, 'v1.6.5-external-services.zip');

// Supprimer l'ancien ZIP s'il existe
if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

console.log('📦 Création du bundle v1.6.5-external-services...');
console.log('Source:', sourceDir);
console.log('Output:', outputFile);

// Utiliser PowerShell avec un mode de compression différent
// ou tar avec le format zip
try {
  // Changer vers le répertoire source et créer le zip
  process.chdir(sourceDir);

  // Essayer avec tar d'abord (format plus compatible)
  const files = fs.readdirSync('.').filter(f => !f.startsWith('.'));
  const filesStr = files.join(' ');

  console.log('Fichiers à inclure:', files.length);

  // Créer une archive tar puis la convertir, ou utiliser directement
  // En fait, utilisons une approche différente avec PowerShell qui crée un vrai zip
  execSync(`powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outputFile}' -CompressionLevel Optimal -Force"`, {
    stdio: 'inherit'
  });

  const stats = fs.statSync(outputFile);
  console.log('✅ Bundle créé:', Math.round(stats.size / 1024), 'KB');
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
}
