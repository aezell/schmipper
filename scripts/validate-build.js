#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Validate extension build
 */
function validateExtension() {
  const extensionDir = path.join(PROJECT_ROOT, 'extension/dist');
  const requiredFiles = [
    'manifest.json',
    'background.js',
    'popup.js',
    'content.js',
    'popup.html',
    'styles.css'
  ];
  
  console.log('🔍 Validating extension build...');
  
  if (!fs.existsSync(extensionDir)) {
    console.log('❌ Extension dist directory not found');
    return false;
  }
  
  let valid = true;
  for (const file of requiredFiles) {
    const filePath = path.join(extensionDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✓ ${file} (${stats.size} bytes)`);
    } else {
      console.log(`✗ ${file} - MISSING`);
      valid = false;
    }
  }
  
  // Validate manifest.json
  try {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.manifest_version === 3) {
        console.log('✓ Manifest v3 format');
      } else {
        console.log('⚠️  Unexpected manifest version:', manifest.manifest_version);
      }
      
      if (manifest.permissions && manifest.permissions.includes('nativeMessaging')) {
        console.log('✓ Native messaging permission');
      } else {
        console.log('⚠️  Native messaging permission not found');
      }
    }
  } catch (error) {
    console.log('❌ Invalid manifest.json:', error.message);
    valid = false;
  }
  
  return valid;
}

/**
 * Validate native host build
 */
function validateNativeHost() {
  const nativeHostDir = path.join(PROJECT_ROOT, 'native-host/dist');
  const requiredFiles = [
    'index.js',
    'index.d.ts'
  ];
  
  console.log('\n🔍 Validating native host build...');
  
  if (!fs.existsSync(nativeHostDir)) {
    console.log('❌ Native host dist directory not found');
    return false;
  }
  
  let valid = true;
  for (const file of requiredFiles) {
    const filePath = path.join(nativeHostDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✓ ${file} (${stats.size} bytes)`);
    } else {
      console.log(`✗ ${file} - MISSING`);
      valid = false;
    }
  }
  
  // Check if main file is executable
  const mainFile = path.join(nativeHostDir, 'index.js');
  if (fs.existsSync(mainFile)) {
    try {
      const stats = fs.statSync(mainFile);
      const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
      if (isExecutable) {
        console.log('✓ Executable permissions set');
      } else {
        console.log('⚠️  Executable permissions not set (may be handled by Node.js)');
      }
    } catch (error) {
      console.log('⚠️  Could not check permissions:', error.message);
    }
  }
  
  return valid;
}

/**
 * Validate TypeScript compilation
 */
function validateTypeScript() {
  console.log('\n🔍 Validating TypeScript compilation...');
  
  const tsFiles = [
    path.join(PROJECT_ROOT, 'extension/dist/background.js'),
    path.join(PROJECT_ROOT, 'extension/dist/popup.js'),
    path.join(PROJECT_ROOT, 'extension/dist/content.js'),
    path.join(PROJECT_ROOT, 'native-host/dist/index.js')
  ];
  
  let valid = true;
  for (const file of tsFiles) {
    if (fs.existsSync(file)) {
      // Check if file contains source maps
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('//# sourceMappingURL=')) {
        console.log(`✓ ${path.relative(PROJECT_ROOT, file)} (with source maps)`);
      } else {
        console.log(`✓ ${path.relative(PROJECT_ROOT, file)} (no source maps)`);
      }
    } else {
      console.log(`✗ ${path.relative(PROJECT_ROOT, file)} - MISSING`);
      valid = false;
    }
  }
  
  return valid;
}

/**
 * Main validation function
 */
function main() {
  console.log('🏗️  Build Validation');
  console.log('==================');
  
  let allValid = true;
  
  if (!validateExtension()) {
    allValid = false;
  }
  
  if (!validateNativeHost()) {
    allValid = false;
  }
  
  if (!validateTypeScript()) {
    allValid = false;
  }
  
  console.log('\n' + '='.repeat(50));
  if (allValid) {
    console.log('✅ All builds are valid!');
    console.log('\nNext steps:');
    console.log('• Load extension: npm run load-instructions');
    console.log('• Install native host: npm run install-native-host');
    console.log('• Start development: npm run dev');
  } else {
    console.log('❌ Build validation failed');
    console.log('\nTo fix:');
    console.log('• Rebuild everything: npm run build');
    console.log('• Clean and rebuild: npm run prepare-dev');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateExtension,
  validateNativeHost,
  validateTypeScript
};
