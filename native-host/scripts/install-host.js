#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const NATIVE_HOST_NAME = 'com.browservolume.host';

// Platform-specific paths for native messaging host manifests
const MANIFEST_PATHS = {
  darwin: {
    chrome: path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
    brave: path.join(os.homedir(), 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
    chromium: path.join(os.homedir(), 'Library/Application Support/Chromium/NativeMessagingHosts')
  },
  win32: {
    chrome: path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/NativeMessagingHosts'),
    brave: path.join(os.homedir(), 'AppData/Local/BraveSoftware/Brave-Browser/User Data/NativeMessagingHosts')
  },
  linux: {
    chrome: path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts'),
    chromium: path.join(os.homedir(), '.config/chromium/NativeMessagingHosts'),
    brave: path.join(os.homedir(), '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts')
  }
};

function createManifest(hostPath) {
  return {
    name: NATIVE_HOST_NAME,
    description: 'Browser Volume Controller Native Host',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://*/'
    ]
  };
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

function installManifestForBrowser(browserPaths, hostPath) {
  let installed = false;
  
  for (const [browserName, manifestDir] of Object.entries(browserPaths)) {
    try {
      ensureDirectoryExists(manifestDir);
      
      const manifestPath = path.join(manifestDir, `${NATIVE_HOST_NAME}.json`);
      const manifest = createManifest(hostPath);
      
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`✅ Installed native messaging host manifest for ${browserName}: ${manifestPath}`);
      installed = true;
    } catch (error) {
      console.warn(`⚠️  Failed to install manifest for ${browserName}:`, error.message);
    }
  }
  
  return installed;
}

function makeExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
    console.log(`✅ Made executable: ${filePath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to make executable:`, error.message);
  }
}

function main() {
  const platform = os.platform();
  
  console.log(`🔧 Installing native messaging host for platform: ${platform}`);
  
  // Determine the path to the native host executable
  const projectRoot = path.resolve(__dirname, '../..');
  const hostScript = path.resolve(__dirname, '../dist/index.js');
  const nodeExe = process.execPath;
  
  // Check if the host is built
  if (!fs.existsSync(hostScript)) {
    console.error('❌ Native host not built. Run `npm run build:native` first.');
    process.exit(1);
  }
  
  // Create a wrapper script that calls node with the host script
  const wrapperScript = path.join(__dirname, '../dist/host-wrapper.js');
  const wrapperContent = `#!/usr/bin/env node
require('./index.js');
`;
  
  fs.writeFileSync(wrapperScript, wrapperContent);
  makeExecutable(wrapperScript);
  
  const hostPath = wrapperScript;
  
  // Get platform-specific manifest paths
  const browserPaths = MANIFEST_PATHS[platform];
  if (!browserPaths) {
    console.error(`❌ Unsupported platform: ${platform}`);
    process.exit(1);
  }
  
  // Install manifests for all browsers
  const success = installManifestForBrowser(browserPaths, hostPath);
  
  if (success) {
    console.log('🎉 Native messaging host installation completed!');
    console.log('\nNext steps:');
    console.log('1. Load the extension in your browser (chrome://extensions/ → Load unpacked → extension/dist/)');
    console.log('2. Test the extension with some audio-playing tabs');
  } else {
    console.error('❌ Failed to install native messaging host manifests');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { installManifestForBrowser, createManifest };
