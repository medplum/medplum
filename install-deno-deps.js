#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function printHelp() {
  console.log('Install Deno Dependencies\n');
  console.log('Usage: ./install-deno-deps.js <functions-dir>\n');
  console.log('Scans for folders with deno.json and runs "deno install".');
}

if (process.argv.includes('--help') || process.argv.includes('-h') || process.argv.length === 2) {
  printHelp();
  process.exit(0);
}

const FUNCTIONS_DIR = process.argv[2];

function installDependencies(folderPath, errorSummary) {
  const folderName = path.basename(folderPath);
  const denoJsonPath = path.join(folderPath, 'deno.json');

  if (!fs.existsSync(denoJsonPath)) {
    console.log(`⚠️  No deno.json found in ${folderName}`);
    errorSummary.noDenoJson.push(folderName);
    return false;
  }

  // Keep existing node_modules (npm deps); only clear Deno cache inside it if present
  const nodeModulesDenoPath = path.join(folderPath, 'node_modules', '.deno');
  if (fs.existsSync(nodeModulesDenoPath)) {
    fs.rmSync(nodeModulesDenoPath, { recursive: true, force: true });
  }

  try {
    console.log(`🔧 Installing dependencies for ${folderName}...`);

    const entrypointCandidates = [
      'index.ts',
      path.join('src', 'index.ts'),
      'main.ts',
      path.join('src', 'main.ts')
    ];

    const entrypoint = entrypointCandidates
      .map(candidate => ({ candidate, full: path.join(folderPath, candidate) }))
      .find(({ full }) => fs.existsSync(full))?.candidate;

    console.log(`  🚀 Using entrypoint: ${entrypoint || 'none found'}`);
    if (entrypoint) {
      execSync(`deno cache --reload ${entrypoint}`, {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf8'
      });
    }

    const result = execSync('deno install --node-modules-dir', {
      cwd: folderPath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    console.log(`✅ Dependencies installed for ${folderName}`);

    if (result.trim()) {
      const lines = result.trim().split('\n');
      const meaningfulLines = lines.filter(line =>
        line.trim() &&
        !line.includes('Download') &&
        !line.includes('Check')
      );

      if (meaningfulLines.length > 0) {
        console.log(`   ℹ️  ${meaningfulLines.join(', ')}`);
      }
    }

    const nmPath = path.join(folderPath, 'node_modules');
    if (fs.existsSync(nmPath)) {
      const nmContents = fs.readdirSync(nmPath).slice(0, 10);
      console.log(`   📦 node_modules: ${nmContents.join(', ')}${nmContents.length >= 10 ? '...' : ''}`);
    }

    errorSummary.success.push(folderName);
    return true;

  } catch (error) {
    console.error(`❌ Failed to install dependencies for ${folderName}`);

    let errorMessage = error.message;
    if (error.stderr) {
      errorMessage = error.stderr.toString().trim() || error.message;
    }

    const errorLines = errorMessage.split('\n');
    const mainError = errorLines.find(line =>
      line.includes('error:') ||
      line.includes('Error:') ||
      line.includes('Failed')
    ) || errorLines[0];

    console.error(`   💥 ${mainError}`);

    errorSummary.installFailed.push({
      folder: folderName,
      error: mainError
    });
    return false;
  }
}

function main() {
  if (!FUNCTIONS_DIR) {
    console.error('❌ Functions directory argument is required.');
    console.error('Usage: ./install-deno-deps.js <functions-dir>');
    process.exit(1);
  }

  console.log(`🔧 Installing Deno dependencies for all folders with deno.json in: ${FUNCTIONS_DIR}\n`);

  const errorSummary = {
    success: [],
    noDenoJson: [],
    installFailed: []
  };

  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.error(`❌ Functions directory not found: ${FUNCTIONS_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true });

  const folders = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !name.startsWith('_'));

  const foldersWithDenoJson = [];

  // Handle deno.json in the root of FUNCTIONS_DIR
  if (entries.some(entry => !entry.isDirectory() && entry.name === 'deno.json')) {
    foldersWithDenoJson.push('.');
  }

  // Handle deno.json inside subfolders
  folders.forEach(folderName => {
    const folderPath = path.join(FUNCTIONS_DIR, folderName);
    const denoJsonPath = path.join(folderPath, 'deno.json');
    if (fs.existsSync(denoJsonPath)) {
      foldersWithDenoJson.push(folderName);
    }
  });

  console.log(`Found ${foldersWithDenoJson.length} folders with deno.json files:\n`);
  console.log(`${foldersWithDenoJson.join(', ')}\n`);

  if (foldersWithDenoJson.length === 0) {
    console.log(`No folders with deno.json files found in ${FUNCTIONS_DIR}.`);
    process.exit(0);
  }

  foldersWithDenoJson.forEach(folderName => {
    const folderPath = folderName === '.' ? FUNCTIONS_DIR : path.join(FUNCTIONS_DIR, folderName);
    installDependencies(folderPath, errorSummary);
  });

  console.log('\n🎉 Dependency installation completed!');

  console.log('\n📊 SUMMARY:');

  if (errorSummary.success.length > 0) {
    console.log(`✅ Successfully installed: ${errorSummary.success.length} folders`);
    console.log(`   ${errorSummary.success.join(', ')}`);
  }

  if (errorSummary.noDenoJson.length > 0) {
    console.log(`\n⚠️  No deno.json found: ${errorSummary.noDenoJson.length} folders`);
    console.log(`   ${errorSummary.noDenoJson.join(', ')}`);
  }

  if (errorSummary.installFailed.length > 0) {
    console.log(`\n❌ Installation failed: ${errorSummary.installFailed.length} folders`);

    const errorGroups = {};
    errorSummary.installFailed.forEach(({ folder, error }) => {
      let errorType = error;

      if (error.includes('Permission denied')) {
        errorType = 'Permission denied';
      } else if (error.includes('network')) {
        errorType = 'Network error';
      } else if (error.includes('not found')) {
        errorType = 'Package not found';
      } else if (error.includes('version')) {
        errorType = 'Version conflict';
      } else {
        errorType = error.split('\n')[0].trim();
      }

      if (!errorGroups[errorType]) {
        errorGroups[errorType] = [];
      }
      errorGroups[errorType].push(folder);
    });

    Object.entries(errorGroups).forEach(([errorType, folders]) => {
      console.log(`   ${errorType}`);
      console.log(`     Affected folders: ${folders.join(', ')}`);
    });
  }

  const totalProcessed = foldersWithDenoJson.length;
  const totalErrors = errorSummary.installFailed.length;

  console.log(`\n📈 TOTALS:`);
  console.log(`   Folders with deno.json: ${totalProcessed}`);
  console.log(`   Successfully installed: ${errorSummary.success.length}`);
  console.log(`   Installation failures: ${totalErrors}`);

  if (totalErrors === 0) {
    console.log('\n🎊 All dependencies installed successfully!');
  } else {
    console.log(`\n🔧 ${totalErrors} folders need attention.`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { installDependencies };