# Browser Volume Controller - Agent Instructions

## Project Overview
Cross-platform browser extension + native messaging host for controlling individual tab volumes. Users can adjust volume of each tab playing audio through a dynamic popup interface with multiple volume control modes.

**Architecture**: Browser Extension (TypeScript) ↔ Native Messaging ↔ Native Host (Node.js) ↔ System Audio APIs

## Frequently Used Commands

### Development
```bash
# Install dependencies for all workspaces
npm install

# Development mode (watches for changes)
npm run dev                    # Starts extension development
npm run dev:extension         # Extension only
cd native-host && npm run dev # Native host only

# Build for production
npm run build                 # Builds everything
npm run build:extension       # Extension only
npm run build:native         # Native host only
```

### Testing & Validation
```bash
# Run all tests
npm test

# Test individual components
npm run test:extension
npm run test:native

# Load extension in browser (after build)
# Chrome: chrome://extensions/ → Load unpacked → extension/dist/
# Brave: brave://extensions/ → Load unpacked → extension/dist/

# Install native messaging host
npm run install-native-host
```

### Platform-Specific Audio Testing
```bash
# macOS - Test Core Audio integration
cd native-host && node -e "console.log(require('./dist/audio/macos.js'))"

# Check browser processes
ps aux | grep -i brave    # Find Brave processes
ps aux | grep -i chrome   # Find Chrome processes
```

## Code Style & Conventions

### TypeScript
- **Strict mode enabled** - All files must pass TypeScript strict checks
- **Interface naming**: PascalCase, descriptive (e.g., `AudioSource`, `VolumeMessage`)
- **File naming**: kebab-case for files, PascalCase for classes
- **Async patterns**: Use async/await, avoid .then() chains

### Extension Development
- **Manifest V3 only** - No Manifest V2 compatibility unless specifically for Firefox
- **Content scripts**: Prefix with content-, avoid global pollution
- **Background scripts**: Use service worker pattern, handle disconnections gracefully
- **Message passing**: Always include error handling and timeout logic

### Native Host
- **Process communication**: All stdin/stdout messages must follow native messaging protocol (4-byte length prefix)
- **Error handling**: Always return structured JSON responses with success/error status
- **Platform detection**: Use `os.platform()` and implement platform-specific audio handlers
- **Audio APIs**: Abstract platform differences behind common interface

## Project Structure Logic

```
extension/
├── src/
│   ├── background.ts      # Native messaging coordination
│   ├── content.ts         # Audio detection in tabs
│   ├── popup.ts          # UI controller
│   ├── audio-detector.ts  # HTML5 + Web Audio monitoring
│   └── volume-modes.ts    # Independent/Linked/Inverse logic
├── dist/                 # Built extension (git-ignored)
└── manifest.json         # Extension configuration

native-host/
├── src/
│   ├── index.ts          # Main entry point & messaging loop
│   ├── audio/            # Platform-specific audio control
│   │   ├── macos.ts      # Core Audio integration
│   │   ├── windows.ts    # WASAPI integration
│   │   └── linux.ts      # PulseAudio integration
│   └── messaging.ts      # Protocol handling
└── dist/                # Built native host (git-ignored)
```

## Development Workflow

### Adding New Features
1. **Plan first**: Update `docs/development-plan.md` with new tasks
2. **Test isolation**: Each feature should work independently
3. **Cross-platform**: Consider macOS/Windows/Linux from the start
4. **Browser compatibility**: Test in Chrome, Brave, Firefox

### Audio Detection Logic
- **Real-time monitoring**: Content scripts detect audio state changes immediately
- **Multiple sources**: Support HTML5 `<audio>`, `<video>`, and Web Audio API
- **Tab lifecycle**: Handle tab navigation, refresh, and closure gracefully
- **Process mapping**: Map browser tabs to system audio processes/streams

### Volume Control Modes
- **Independent**: Each audio source controlled separately (default)
- **Linked**: All sources move together, maintaining relative levels
- **Inverse**: When one source goes up, others go down proportionally
- **Smart grouping**: Option to group by domain (e.g., all YouTube tabs together)

## Testing Strategy

### Extension Testing
- **Manual**: Load unpacked extension, test with multiple audio tabs
- **Audio sources**: Test YouTube, Spotify Web, HTML5 video, Web Audio demos
- **Edge cases**: Tab navigation, browser restart, extension reload

### Native Host Testing
- **Audio control**: Verify volume changes affect correct browser processes
- **Process detection**: Ensure tab-to-process mapping accuracy
- **Platform testing**: Test on actual macOS/Windows systems, not just development

### Integration Testing
- **Message flow**: Extension ↔ Native Host communication
- **Error handling**: Network failures, process crashes, permission issues
- **Performance**: Response time for volume changes should be < 100ms

## Common Pitfalls & Solutions

### Browser Extension
- **Content script injection**: Use `document_start` to catch early audio
- **Background script limitations**: Service workers can be terminated, design for reconnection
- **Cross-origin audio**: Some sites block audio access, provide fallback UX

### Native Messaging
- **Host registration**: macOS/Windows have different registry locations
- **Process permissions**: Audio control may require elevated permissions
- **Binary communication**: Always use proper 4-byte length prefixes

### Audio APIs
- **macOS Core Audio**: Complex API, focus on application-level volume control first
- **Windows WASAPI**: Different audio session architecture than macOS
- **Linux variety**: Support both PulseAudio and ALSA where possible

## Browser-Specific Notes

### Brave
- **Primary target**: Chromium-based, same APIs as Chrome
- **Ad blocking**: May affect some audio detection methods
- **Privacy features**: Respect enhanced privacy settings

### Chrome
- **Process model**: Each tab often gets separate process (helpful for audio control)
- **Extensions API**: Standard Manifest V3 implementation

### Firefox
- **Manifest differences**: May need separate manifest-firefox.json for V2
- **WebExtensions API**: Slightly different from Chrome in some areas

## Quick Reference

### Key Files to Modify for Features
- **UI changes**: `extension/src/popup.ts`, `extension/src/popup.html`
- **Audio detection**: `extension/src/audio-detector.ts`
- **Volume modes**: `extension/src/volume-modes.ts`
- **macOS audio**: `native-host/src/audio/macos.ts`
- **Protocol changes**: Both `extension/src/background.ts` and `native-host/src/messaging.ts`

### Debug Commands
```bash
# View extension console
# Chrome DevTools → Extensions → Browser Volume Controller → background page

# View native host logs
tail -f /tmp/browser-volume-host.log

# Test native messaging directly
echo '{"action":"getAudioSources"}' | node native-host/dist/index.js
```

This project requires careful coordination between browser APIs and system audio APIs. When in doubt, test on real audio sources and multiple platforms early.
