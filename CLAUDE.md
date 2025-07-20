# CLAUDE.md - Schmipper Project Instructions

## Project Overview
Schmipper is a cross-platform browser extension + native messaging host that enables users to control individual browser tab volumes. The system consists of:

- **Browser Extension**: Detects audio sources, provides UI, communicates with native host
- **Native Host**: Controls system audio levels for specific browser processes  
- **Communication**: JSON messages via Native Messaging API

**Tech Stack**: TypeScript, Node.js, Chrome Extensions API, Native Messaging, Core Audio (macOS)

## Development Commands

### Setup & Installation
```bash
# Install dependencies (uses asdf for Node.js 22.12.0+)
asdf install
npm install

# Build everything
npm run build

# Install native messaging host
npm run install-native-host
```

### Development Workflow
```bash
# Development mode with watching
npm run dev                 # All components
npm run dev:extension      # Extension only
cd native-host && npm run dev  # Native host only

# Testing
npm test                   # All tests
npm run test:extension     # Extension tests only
npm run test:native        # Native host tests only

# Load extension in browser (after build)
# Chrome/Brave: Navigate to chrome://extensions/ → Developer mode → Load unpacked → extension/dist/
```

### Lint & Type Checking
```bash
# Always run these before committing changes
npm run lint               # Lint all code
npm run typecheck          # TypeScript checking
```

## Project Structure

```
schmipper/
├── extension/             # Browser extension (TypeScript)
│   ├── src/
│   │   ├── background.ts     # Native messaging coordination
│   │   ├── content.ts        # Audio detection in tabs
│   │   ├── popup.ts          # UI controller
│   │   ├── audio-detector.ts # HTML5 + Web Audio monitoring
│   │   └── volume-modes.ts   # Independent/Linked/Inverse logic
│   ├── dist/                 # Built extension (git-ignored)
│   └── manifest.json         # Extension configuration
├── native-host/           # Native messaging host (Node.js)
│   ├── src/
│   │   ├── index.ts          # Main entry point & messaging loop
│   │   ├── audio/            # Platform-specific audio control
│   │   │   ├── macos.ts      # Core Audio integration
│   │   │   ├── windows.ts    # WASAPI integration (planned)
│   │   │   └── index.ts      # Platform abstraction
│   │   └── messaging.ts      # Protocol handling
│   └── dist/                 # Built native host (git-ignored)
├── docs/                  # Website & documentation
├── scripts/               # Build and deployment scripts
└── .tool-versions         # asdf version specification
```

## Key Development Areas

### 1. Audio Detection (extension/src/)
- **Real-time monitoring**: Content scripts detect audio state changes immediately
- **Multiple sources**: Support HTML5 `<audio>`, `<video>`, and Web Audio API
- **Tab lifecycle**: Handle tab navigation, refresh, and closure gracefully
- **Process mapping**: Map browser tabs to system audio processes/streams

### 2. Volume Control Modes (extension/src/volume-modes.ts)
- **Independent**: Each audio source controlled separately (default)
- **Linked**: All sources move together, maintaining relative levels
- **Inverse**: When one source goes up, others go down proportionally
- **Smart grouping**: Option to group by domain (e.g., all YouTube tabs together)

### 3. Native Audio Control (native-host/src/audio/)
- **macOS**: Core Audio integration for per-tab/process volume control
- **Windows**: WASAPI integration (planned)
- **Process detection**: Map browser tabs to specific audio streams
- **Chrome process model**: Handle process-per-tab architecture

### 4. Native Messaging Protocol (extension/src/background.ts, native-host/src/messaging.ts)
- **Message validation**: Structured JSON with error handling
- **Async patterns**: Request/response with timeout logic
- **Connection management**: Handle disconnections and reconnection
- **Binary protocol**: 4-byte length prefix for native messaging

## Code Conventions

### TypeScript
- **Strict mode enabled** - All files must pass TypeScript strict checks
- **Interface naming**: PascalCase, descriptive (`AudioSource`, `VolumeMessage`)
- **File naming**: kebab-case for files, PascalCase for classes
- **Async patterns**: Use async/await, avoid .then() chains
- **No comments unless requested by user**

### Extension Development
- **Manifest V3 only** - Current standard for Chrome extensions
- **Content scripts**: Prefix with content-, avoid global pollution
- **Background scripts**: Use service worker pattern, handle disconnections gracefully
- **Message passing**: Always include error handling and timeout logic

### Native Host
- **Process communication**: stdin/stdout with 4-byte length prefix protocol
- **Error handling**: Structured JSON responses with success/error status
- **Platform abstraction**: Common interface hiding platform differences
- **Audio APIs**: macOS Core Audio, Windows WASAPI (planned)

## Testing Strategy

### Browser Extension Testing
```bash
# Manual testing with real audio sources
# 1. Load unpacked extension in Chrome/Brave
# 2. Open multiple tabs with audio (YouTube, Spotify Web, HTML5 video)
# 3. Test volume controls, mode switching, real-time updates
# 4. Test edge cases: tab navigation, browser restart, extension reload
```

### Native Host Testing
```bash
# Audio control verification
# 1. Test volume changes affect correct browser processes
# 2. Verify tab-to-process mapping accuracy
# 3. Test on actual macOS systems (not just development)
# 4. Message flow testing: Extension ↔ Native Host communication

# Debug native messaging directly
echo '{"action":"getAudioSources"}' | node native-host/dist/index.js
```

### Integration Testing
- **Message flow**: Extension ↔ Native Host communication
- **Error handling**: Network failures, process crashes, permission issues
- **Performance**: Response time for volume changes should be < 100ms

## Common Debug Commands

### Extension Debugging
```bash
# View extension console in Chrome DevTools
# Navigate to: chrome://extensions/ → Schmipper → background page → Console

# View content script console
# Open DevTools on any page → Console → Filter by extension ID
```

### Native Host Debugging
```bash
# View native host logs (if logging implemented)
tail -f /tmp/browser-volume-host.log

# Test native messaging protocol manually
echo '{"action":"getAudioSources"}' | node native-host/dist/index.js

# Check browser processes for audio
ps aux | grep -i brave    # Brave processes
ps aux | grep -i chrome   # Chrome processes
```

### Platform-Specific Testing
```bash
# macOS - Test Core Audio integration
cd native-host && node -e "console.log(require('./dist/audio/macos.js'))"

# Check if native messaging manifest is properly installed
ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```

## Development Phases

### Phase 1: Core Infrastructure
1. **Extension UI**: Dynamic popup showing tabs with audio, volume sliders
2. **macOS Audio**: Core Audio integration for per-tab volume control
3. **Audio Detection**: Real-time detection of tabs with active audio
4. **Native Messaging**: Robust communication protocol
5. **Build System**: Automated build and installation process

### Phase 2: Advanced Features  
6. **Volume Modes**: Independent, Linked, Inverse modes
7. **Keyboard Shortcuts**: Global hotkeys for quick volume control
8. **Cross-Browser**: Firefox and other Chromium browser support

### Phase 3: Polish & Distribution
9. **Windows Support**: WASAPI integration
10. **Error Handling**: Comprehensive error handling and logging

## Browser Compatibility

### Brave (Primary Target)
- Chromium-based, same APIs as Chrome
- Consider ad blocking impact on audio detection
- Respect enhanced privacy settings

### Chrome
- Standard Manifest V3 implementation
- Process-per-tab model helpful for audio control

### Firefox (Planned)
- May need separate manifest-firefox.json for Manifest V2
- WebExtensions API differences from Chrome

## Important Files to Know

### For UI Changes
- `extension/src/popup.ts` - Main popup logic
- `extension/src/popup.html` - Popup HTML structure
- `extension/src/styles.css` - Extension styling

### For Audio Features
- `extension/src/audio-detector.ts` - Audio detection logic
- `extension/src/volume-modes.ts` - Volume control modes
- `native-host/src/audio/macos.ts` - macOS audio control
- `native-host/src/audio/index.ts` - Platform audio abstraction

### For Protocol Changes
- `extension/src/background.ts` - Extension side messaging
- `native-host/src/messaging.ts` - Native host side messaging
- `native-host/src/index.ts` - Main native host entry point

## Security Considerations
- Never expose system audio APIs to web content directly
- Validate all messages between extension and native host
- Respect user privacy settings and audio permissions
- Handle elevated permissions for audio control gracefully

## Performance Requirements
- Volume changes should respond within 100ms
- Audio detection should not impact tab performance
- Native host should handle multiple simultaneous audio sources
- Extension popup should load and display audio sources quickly

## Common Pitfalls

### Extension Development
- Content script injection timing - use `document_start` to catch early audio
- Service worker termination - design for reconnection scenarios
- Cross-origin audio restrictions - provide fallback UX

### Native Messaging
- Host registration varies by platform - different registry locations
- Binary protocol requirements - always use 4-byte length prefixes
- Process permissions - audio control may require elevated permissions

### Audio APIs
- macOS Core Audio complexity - focus on application-level volume first
- Windows WASAPI architecture differences from macOS
- Linux audio system variety - support PulseAudio and ALSA where possible

## Website Development
The project website is in `docs/` with neobrutalist design:
```bash
# Local development
cd docs
python -m http.server 8000
# Visit http://localhost:8000
```

Website deploys automatically to GitHub Pages from main branch.