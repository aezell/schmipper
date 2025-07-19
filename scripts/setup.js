#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(command, cwd = process.cwd()) {
  console.log(`🔨 Running: ${command}`);
  try {
    execSync(command, { 
      cwd, 
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    throw error;
  }
}

function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    console.log(`✅ Node.js: ${nodeVersion}`);
    
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`✅ npm: ${npmVersion}`);
  } catch (error) {
    console.error('❌ Node.js or npm not found. Please install Node.js first.');
    process.exit(1);
  }
  
  // Check if we're in the right directory
  if (!fs.existsSync('package.json')) {
    console.error('❌ package.json not found. Run this script from the project root.');
    process.exit(1);
  }
  
  console.log('✅ Prerequisites check passed');
}

function installDependencies() {
  console.log('\n📦 Installing dependencies...');
  run('npm install');
}

function buildProject() {
  console.log('\n🏗️  Building project...');
  
  console.log('Building extension...');
  run('npm run build', 'extension');
  
  console.log('Building native host...');
  run('npm run build', 'native-host');
}

function installNativeHost() {
  console.log('\n🔧 Installing native messaging host...');
  run('npm run install-native-host', 'native-host');
}

function checkBrowser() {
  console.log('\n🌐 Browser setup instructions:');
  console.log('1. Open your browser (Chrome, Brave, etc.)');
  console.log('2. Go to chrome://extensions/ (or brave://extensions/)');
  console.log('3. Enable "Developer mode" (toggle in top right)');
  console.log('4. Click "Load unpacked" and select the extension/dist/ folder');
  console.log('5. The Browser Volume Controller extension should appear in your extensions list');
}

function main() {
  console.log('🚀 Browser Volume Controller Setup\n');
  
  try {
    checkPrerequisites();
    installDependencies();
    buildProject();
    installNativeHost();
    checkBrowser();
    
    console.log('\n🎉 Setup completed successfully!');
    console.log('\nDevelopment commands:');
    console.log('  npm run dev           - Start development mode (watches for changes)');
    console.log('  npm run build         - Build both extension and native host');
    console.log('  npm test              - Run tests');
    console.log('  npm run dev:extension - Watch extension files only');
    console.log('\nTroubleshooting:');
    console.log('  - If extension doesn\'t load: Check chrome://extensions/ for errors');
    console.log('  - If audio control doesn\'t work: Check that native host is installed correctly');
    console.log('  - If no audio detected: Try YouTube, Spotify, or HTML5 video sites');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkPrerequisites, installDependencies, buildProject, installNativeHost };
