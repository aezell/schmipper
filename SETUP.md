# 🚀 Schmipper Setup Guide

Get the Tab Volume Chaos Controller running on your machine in minutes!

## Prerequisites

### Node.js 22+
```bash
# Check your Node.js version
node --version  # Should show v22.12.0 or higher
```

### Using asdf (Recommended)
If you use asdf for version management:
```bash
# Install Node.js plugin (if not already installed)
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git

# Install the version specified in .tool-versions
asdf install

# Verify correct version
node --version    # Should show v22.12.0
```

### Alternative Installation
If you prefer managing Node.js yourself, install Node.js 22.12.0+ from [nodejs.org](https://nodejs.org/).

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/schmipper.git
cd schmipper
```

### 2. Automatic Setup (Recommended)
```bash
# This installs dependencies, builds everything, and sets up the native host
npm install
```

The `npm install` command automatically runs the setup script that:
- Installs all dependencies for extension and native host
- Builds the extension and native host
- Installs and registers the native messaging host
- Verifies everything is working

### 3. Manual Setup (If Automatic Fails)
```bash
# Install dependencies
npm install

# Build everything
npm run build

# Install native messaging host
npm run install-native-host
```

## Load Extension in Browser

### Chrome/Brave (Primary Support)
1. **Open Extensions Page**:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`

2. **Enable Developer Mode**:
   - Toggle "Developer mode" in the top right corner

3. **Load Extension**:
   - Click "Load unpacked"
   - Navigate to your project folder
   - Select the `extension/dist/` folder (NOT just `extension/`)
   - Click "Select Folder"

4. **Verify Installation**:
   - Schmipper should appear in your extensions list
   - You should see the Schmipper icon in your browser toolbar

### Edge (Should Work)
Same process as Chrome, but use `edge://extensions/`

### Firefox (Limited Support)
Firefox support is not fully implemented yet. Stick with Chrome/Brave for now.

## Test the Extension

### 1. Open Audio Sources
Start playing audio in multiple tabs:
- **YouTube**: Any video with sound
- **Spotify Web**: Open spotify.com and play music
- **Discord Web**: Join a voice channel
- **HTML5 Audio**: Any website with audio/video elements

### 2. Access Schmipper
- Click the Schmipper icon in your browser toolbar
- You should see a popup with volume controls

### 3. Try the Features

**Volume Control**:
- Each tab with audio gets its own volume slider
- Adjust individual tab volumes
- Use the master volume controls

**Volume Modes**:
- **Independent** (default): Each tab controlled separately
- **Linked**: All tabs move together maintaining relative levels
- **Inverse**: When one goes up, others go down

**Keyboard Shortcuts** (4 shortcuts due to Chrome limitations):
- `Ctrl+Shift+M` (Cmd+Shift+M on Mac): Mute/unmute all audio sources
- `Ctrl+Shift+↑`: Increase volume for all sources (+10%)
- `Ctrl+Shift+↓`: Decrease volume for all sources (-10%)
- `Ctrl+Shift+Tab`: Cycle through volume modes (Independent → Linked → Inverse)

## Development Mode

For active development and testing:

### Watch Mode
```bash
# Extension development (rebuilds on file changes)
npm run dev:extension

# Native host development (rebuilds on file changes)
npm run dev:native

# Both at once
npm run dev
```

### Debug Mode
```bash
# Enable verbose logging for native host
BROWSER_VOLUME_DEBUG=true npm run dev:native

# View native host logs in real-time
tail -f /tmp/browser-volume-host.log
```

### Reload Extension
When you make changes to the extension code:
1. Build the changes: `npm run build:extension`
2. Go to `chrome://extensions/`
3. Click the reload button on the Schmipper extension
4. Test your changes

## Troubleshooting

### Extension Won't Load
**Problem**: Error loading extension or extension doesn't appear

**Common Errors**:

1. **"Too many shortcuts specified for 'commands': The maximum is 4."**
   - This means you have an old version built with too many shortcuts
   - Solution: Run `npm run build:extension` to rebuild with the fixed manifest

2. **"Could not load icon 'icons/icon16.png' specified in 'icons'"**
   - The manifest was referencing icon files that don't exist yet
   - **Solution**: Run `npm run build:extension` to get the updated manifest without icon references
   - The extension will use default browser icons (shows as a gray puzzle piece)

**Other Solutions**:
- Make sure you selected `extension/dist/` folder, not `extension/`
- Check for errors in `chrome://extensions/` → Click "Errors" on Schmipper
- Try building again: `npm run build:extension`
- Refresh the extension page and try reloading

### No Audio Sources Detected
**Problem**: Extension popup shows "No audio sources detected"

**Solutions**:
- Make sure audio is actually playing in your tabs
- Try refreshing the tab with audio
- Check if the tab is muted in the browser
- Look for errors in browser console (F12 → Console tab)

### Native Messaging Not Working
**Problem**: Extension loads but can't control volume

**Solutions**:
1. **Verify native host installation**:
   ```bash
   # Check if host is installed
   ls ~/Library/Application\ Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/
   # Should show: com.browservolume.host.json
   ```

2. **Test native host manually**:
   ```bash
   cd native-host
   echo '{"action":"getAudioSources"}' > test.json
   node -e "
   const fs = require('fs');
   const message = fs.readFileSync('test.json', 'utf8').trim();
   const length = Buffer.byteLength(message, 'utf8');
   const lengthBuffer = Buffer.alloc(4);
   lengthBuffer.writeUInt32LE(length, 0);
   fs.writeFileSync('test.bin', Buffer.concat([lengthBuffer, Buffer.from(message, 'utf8')]));
   " && cat test.bin | node dist/index.js
   rm test.json test.bin
   ```

3. **Reinstall native host**:
   ```bash
   npm run install-native-host
   ```

### Permission Issues (macOS)
**Problem**: "Permission denied" or audio control not working

**Solutions**:
- Grant microphone permissions to your browser in System Preferences → Security & Privacy
- Some audio APIs require accessibility permissions
- Try running with debug mode to see detailed error messages

### Build Failures
**Problem**: `npm run build` fails with errors

**Solutions**:
1. **Clean and rebuild**:
   ```bash
   npm run clean
   npm run build
   ```

2. **Check Node.js version**:
   ```bash
   node --version  # Should be 22.12.0+
   ```

3. **Clear npm cache**:
   ```bash
   npm cache clean --force
   rm -rf node_modules
   npm install
   ```

## Testing Audio Sources

### Best Test Sites
- **YouTube**: https://youtube.com (any video)
- **Spotify Web**: https://open.spotify.com
- **SoundCloud**: https://soundcloud.com
- **HTML5 Audio Test**: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio
- **Web Audio API Demo**: Search for "Web Audio API examples"

### Testing Multiple Sources
1. Open 3-4 tabs with different audio sources
2. Start playing audio in each tab at different volume levels
3. Open Schmipper popup
4. Verify each source appears with correct tab title and favicon
5. Test volume adjustments and different modes

## Advanced Testing

### Keyboard Shortcuts
Test all shortcuts work when browser is not focused:
- Open some audio in multiple tabs
- Focus a different application (like Terminal)
- Try the keyboard shortcuts - they should still work

### Edge Cases
- Navigate to a new page in a tab with audio
- Close tabs with audio
- Open new tabs with audio
- Browser restart with extension installed

### Performance
- Test with 10+ tabs with audio
- Check CPU usage with Activity Monitor
- Monitor memory usage over extended periods

## Getting Help

### Debug Information
When reporting issues, include:
```bash
# System info
uname -a
node --version
npm --version

# Extension logs (from browser console)
# Native host logs
cat /tmp/browser-volume-host.log

# Extension manifest
cat extension/dist/manifest.json
```

### Common Log Locations
- **Native host logs**: `/tmp/browser-volume-host.log`
- **Extension logs**: Browser DevTools → Console
- **Build logs**: Terminal output from npm commands

### Resources
- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check the `docs/` folder
- **Development Plan**: See `docs/development-plan.md`

---

**🎉 Success!** If everything is working, you should be able to control individual tab volumes like the audio wizard you were meant to be! 

For more information, visit [schmipper.live](https://schmipper.live) or check out the [development documentation](docs/development-plan.md).
