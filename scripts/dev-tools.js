#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Get Chrome/Brave extension directory for development
 */
function getExtensionPath() {
  return path.join(PROJECT_ROOT, 'extension/dist');
}

/**
 * Generate extension loading instructions
 */
function generateLoadInstructions() {
  const extensionPath = getExtensionPath();
  const platform = os.platform();
  
  console.log('🔌 Extension Loading Instructions');
  console.log('================================');
  console.log('');
  console.log('1. Build the extension:');
  console.log('   npm run build:extension');
  console.log('');
  console.log('2. Open your browser and navigate to:');
  console.log('   • Chrome: chrome://extensions/');
  console.log('   • Brave: brave://extensions/');
  console.log('   • Edge: edge://extensions/');
  console.log('');
  console.log('3. Enable "Developer mode" (toggle in top right)');
  console.log('');
  console.log('4. Click "Load unpacked" and select:');
  console.log(`   ${extensionPath}`);
  console.log('');
  console.log('5. The extension should now appear in your extensions list');
  console.log('');
  
  if (platform === 'darwin') {
    console.log('💡 macOS Tip:');
    console.log('   You can drag the dist folder from Finder to the extensions page');
    console.log('');
  }
  
  console.log('🔧 Development Workflow:');
  console.log('   • npm run dev:extension    (watches for changes)');
  console.log('   • npm run dev:native       (watches native host)');
  console.log('   • npm run dev              (watches both)');
  console.log('');
  console.log('   After code changes, click the extension reload button in browser');
}

/**
 * Check if extension is built and ready
 */
function checkExtensionReady() {
  const extensionPath = getExtensionPath();
  const requiredFiles = [
    'manifest.json',
    'background.js',
    'popup.js',
    'content.js',
    'popup.html'
  ];
  
  console.log('🔍 Checking extension build status...');
  
  if (!fs.existsSync(extensionPath)) {
    console.log('❌ Extension not built. Run: npm run build:extension');
    return false;
  }
  
  let allPresent = true;
  for (const file of requiredFiles) {
    const filePath = path.join(extensionPath, file);
    if (fs.existsSync(filePath)) {
      console.log(`✓ ${file}`);
    } else {
      console.log(`✗ ${file} (missing)`);
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log('✅ Extension is ready to load!');
    console.log(`📁 Extension path: ${extensionPath}`);
  } else {
    console.log('❌ Extension build incomplete');
  }
  
  return allPresent;
}

/**
 * Watch for file changes and show reload instructions
 */
function watchMode() {
  console.log('👀 Watch mode instructions');
  console.log('=========================');
  console.log('');
  console.log('1. Start development mode:');
  console.log('   npm run dev');
  console.log('');
  console.log('2. When files change, you\'ll need to:');
  console.log('   • Extension changes: Click reload button in browser extensions page');
  console.log('   • Native host changes: Restart any active browser connections');
  console.log('');
  console.log('3. For faster development:');
  console.log('   • Use browser DevTools for extension debugging');
  console.log('   • Check native host logs for communication issues');
  console.log('   • Use npm run native-host-status to verify host installation');
}

/**
 * Show debugging tips
 */
function showDebuggingTips() {
  console.log('🐛 Debugging Tips');
  console.log('================');
  console.log('');
  console.log('Extension Debugging:');
  console.log('• Right-click extension icon → Inspect popup');
  console.log('• chrome://extensions/ → Details → Inspect views: background page');
  console.log('• Check browser console for content script errors');
  console.log('');
  console.log('Native Host Debugging:');
  console.log('• Check installation: npm run native-host-status');
  console.log('• Test native host directly: cd native-host && node dist/index.js');
  console.log('• Check browser native messaging permissions');
  console.log('');
  console.log('Common Issues:');
  console.log('• Native host not found: Reinstall with npm run install-native-host');
  console.log('• Permission denied: Check file permissions on native host executable');
  console.log('• Connection timeout: Verify native host manifest paths are absolute');
  console.log('');
  console.log('Logs & Monitoring:');
  console.log('• Extension logs: Browser DevTools console');
  console.log('• Native host logs: Add console.log statements (they go to browser console)');
  console.log('• Native messaging errors: Check browser\'s extension error reporting');
}

/**
 * Generate development environment summary
 */
function developmentStatus() {
  console.log('📊 Development Environment Status');
  console.log('=================================');
  console.log('');
  
  // Check builds
  const extensionBuilt = fs.existsSync(getExtensionPath());
  const nativeHostBuilt = fs.existsSync(path.join(PROJECT_ROOT, 'native-host/dist/index.js'));
  
  console.log('Build Status:');
  console.log(`• Extension: ${extensionBuilt ? '✅ Built' : '❌ Not built'}`);
  console.log(`• Native Host: ${nativeHostBuilt ? '✅ Built' : '❌ Not built'}`);
  console.log('');
  
  // Check native host installation
  try {
    execSync('npm run native-host-status', { 
      stdio: 'pipe',
      cwd: PROJECT_ROOT
    });
  } catch (error) {
    console.log('❌ Could not check native host status');
  }
  
  console.log('');
  console.log('Quick Actions:');
  if (!extensionBuilt || !nativeHostBuilt) {
    console.log('• Build everything: npm run build');
  }
  console.log('• Start development: npm run dev');
  console.log('• Load extension: Follow instructions from npm run dev-tools load');
  console.log('• Clean restart: npm run prepare-dev');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  switch (command) {
    case 'load':
      generateLoadInstructions();
      break;
      
    case 'check':
      checkExtensionReady();
      break;
      
    case 'watch':
      watchMode();
      break;
      
    case 'debug':
      showDebuggingTips();
      break;
      
    case 'status':
      developmentStatus();
      break;
      
    case 'help':
    default:
      console.log('🛠️  Browser Volume Controller - Development Tools');
      console.log('==============================================');
      console.log('');
      console.log('Usage:');
      console.log('  node dev-tools.js [command]');
      console.log('');
      console.log('Commands:');
      console.log('  load     Show extension loading instructions');
      console.log('  check    Check if extension is ready to load');
      console.log('  watch    Show development watch mode instructions');
      console.log('  debug    Show debugging tips and common issues');
      console.log('  status   Show complete development environment status');
      console.log('  help     Show this help');
      console.log('');
      console.log('Quick Setup:');
      console.log('  npm install          # Complete setup');
      console.log('  npm run dev          # Start development mode');
      console.log('  node scripts/dev-tools.js load  # Extension loading guide');
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getExtensionPath,
  generateLoadInstructions,
  checkExtensionReady,
  watchMode,
  showDebuggingTips,
  developmentStatus
};
