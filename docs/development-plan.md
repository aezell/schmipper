# Development Plan: Browser Volume Controller

## Phase 1: Core Infrastructure (Subagent Tasks)

### Task 1: Extension UI Development
**Assignable to subagent**: ✅
**Files**: `extension/src/popup.html`, `extension/src/popup.ts`, `extension/src/styles.css`
**Goal**: Create dynamic browser extension popup that shows all tabs with audio
**Requirements**:
- Dynamic list of audio sources (tabs/windows currently playing audio)
- Individual volume slider for each audio source (0-100%)
- Tab title/favicon display for easy identification
- Volume control options for managing multiple audio sources
- Master volume controls and mute-all functionality
- Real-time updates when audio starts/stops in tabs
**Validation**: Extension popup dynamically shows/hides audio sources and controls work

### Task 2: Native Host macOS Audio Integration
**Assignable to subagent**: ✅
**Files**: `native-host/src/audio/macos.ts`, `native-host/src/audio/index.ts`
**Goal**: Implement macOS Core Audio integration for per-tab/process volume control
**Requirements**:
- Detect browser processes and map to specific tabs
- Get/set volume levels for individual audio streams
- Handle multiple tabs with audio in same browser process
- Support Chrome's process-per-tab architecture
**Validation**: Can control volume of individual tabs playing audio

### Task 3: Audio Source Detection & Mapping
**Assignable to subagent**: ✅
**Files**: `extension/src/content.ts`, `extension/src/audio-detector.ts`, `extension/src/tab-manager.ts`
**Goal**: Real-time detection of tabs with active audio playback
**Requirements**:
- Detect audio playback state in each tab (HTML5 audio, video, Web Audio API)
- Track tab metadata (title, favicon, URL, tabId)
- Monitor audio start/stop events across all tabs
- Map browser tabs to native audio streams/processes
- Handle tab navigation and audio source changes
**Validation**: Extension accurately tracks which tabs are playing audio in real-time

### Task 4: Native Messaging Protocol
**Assignable to subagent**: ✅
**Files**: `native-host/src/messaging.ts`, `extension/src/native-bridge.ts`
**Goal**: Robust communication between extension and native host
**Requirements**:
- Message validation and error handling
- Async request/response patterns
- Connection management and reconnection
**Validation**: Extension and native host communicate reliably

### Task 5: Build System & Installation
**Assignable to subagent**: ✅
**Files**: `extension/webpack.config.js`, `native-host/scripts/install-host.js`, `scripts/`
**Goal**: Automated build and installation process
**Requirements**:
- Bundle extension for production
- Install native messaging host manifest
- Cross-platform build scripts
**Validation**: One-command setup works on fresh macOS machine

## Phase 2: Advanced Features (Subagent Tasks)

### Task 6: Volume Control Enhancement
**Assignable to subagent**: ✅
**Files**: `extension/src/volume-control.ts`
**Goal**: Implement enhanced volume control for multiple audio sources
**Requirements**:
- Individual control: each audio source controlled separately
- Master controls: mute all, volume up/down all sources
- Smart grouping: option to group by domain/site
- Bulk operations: apply changes to multiple sources at once
**Validation**: Control works correctly with 2+ audio sources

### Task 7: Cross-Browser Compatibility
**Assignable to subagent**: ✅
**Files**: `extension/manifest-firefox.json`, browser-specific adapters
**Goal**: Support Firefox and other Chromium browsers
**Requirements**:
- Firefox Manifest V2 version
- Browser-specific API handling
- Unified build process
**Validation**: Works in Chrome, Firefox, Brave, Edge

## Phase 3: Polish & Distribution (Subagent Tasks)

### Task 8: Windows Audio Support
**Assignable to subagent**: ✅
**Files**: `native-host/src/audio/windows.ts`
**Goal**: Windows WASAPI integration
**Requirements**:
- Windows audio session management
- Process-specific volume control
- Handle Windows audio architecture differences
**Validation**: Works on Windows 10/11

### Task 9: Error Handling & Logging
**Assignable to subagent**: ✅
**Files**: `native-host/src/logger.ts`, `extension/src/error-handler.ts`
**Goal**: Comprehensive error handling and debugging
**Requirements**:
- Structured logging
- User-friendly error messages
- Debug mode with verbose output
**Validation**: Clear error messages for common failure cases

## Task Dependencies
```
Task 1 (UI) → Task 6 (Volume Control)
Task 2 (Audio) → Task 8 (Windows)
Task 3 (Detection) → Task 4 (Messaging) → Task 5 (Build)
Task 4 (Messaging) → Task 7 (Cross-browser)
Task 5 (Build) → Task 9 (Error Handling)
```

## Parallel Development Strategy
- **Week 1**: Tasks 1, 2, 3 (parallel)
- **Week 2**: Tasks 4, 5 (sequential after week 1)
- **Week 3**: Tasks 6, 7 (parallel after messaging works)
- **Week 4**: Tasks 8, 9 (parallel, polish phase)
