# Browser Volume Controller - Build Scripts

This directory contains automation scripts for the Browser Volume Controller project.

## Scripts Overview

### `setup.js` - Complete Project Setup
**Usage**: `npm install` (automatic) or `node scripts/setup.js`

Complete project setup automation that:
- Checks prerequisites (Node.js 16+, npm, git)
- Installs all dependencies for workspaces
- Builds extension and native host
- Installs native messaging host for all supported browsers
- Verifies installation

**Commands**:
- `node scripts/setup.js install` - Full setup (default)
- `node scripts/setup.js clean` - Clean build artifacts
- `node scripts/setup.js verify` - Verify installation

### `dev-tools.js` - Development Utilities
**Usage**: `npm run dev-tools [command]`

Development workflow helpers:
- Extension loading instructions
- Build status checking
- Development environment status
- Debugging tips and common issues

**Commands**:
- `npm run load-instructions` - Show extension loading guide
- `npm run extension-status` - Check if extension is ready
- `node scripts/dev-tools.js debug` - Debugging tips
- `node scripts/dev-tools.js status` - Development environment overview

### `validate-build.js` - Build Validation
**Usage**: `npm run validate-build`

Validates build output:
- Checks all required extension files exist
- Validates manifest.json format and permissions
- Verifies native host compilation
- Checks TypeScript source maps
- Reports file sizes and permissions

## Native Host Installation

### `native-host/scripts/install-host.js`
**Usage**: `npm run install-native-host`

Cross-platform native messaging host installation:
- Generates native messaging manifest
- Installs for Chrome, Brave, Edge (platform-dependent)
- Sets executable permissions
- Handles absolute path resolution

**Commands**:
- `npm run install-native-host` - Install for all browsers
- `npm run uninstall-native-host` - Remove from all browsers
- `npm run native-host-status` - Check installation status
- `cd native-host && node scripts/install-host.js install chrome` - Install for specific browser

## Development Workflow Commands

### Quick Start
```bash
npm install                    # Complete setup (runs setup.js automatically)
npm run dev                    # Start development mode (watches both extension and native host)
npm run load-instructions      # Show how to load extension in browser
```

### Development Commands
```bash
npm run dev:extension          # Watch extension only
npm run dev:native            # Watch native host only
npm run build                 # Build everything for production
npm run clean                 # Clean build artifacts
npm run prepare-dev           # Clean + build + install native host
```

### Testing & Validation
```bash
npm test                      # Run all tests
npm run validate-build        # Validate build output
npm run verify               # Verify complete installation
npm run native-host-status   # Check native host installation
```

### Debugging
```bash
npm run dev-tools debug       # Show debugging tips
npm run extension-status      # Check extension build status
node scripts/dev-tools.js status  # Complete environment status
```

## Platform Support

### macOS (Primary Target)
- **Chrome**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- **Brave**: `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
- **Edge**: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`

### Windows
- **Chrome**: `~/AppData/Local/Google/Chrome/User Data/NativeMessagingHosts/`
- **Brave**: `~/AppData/Local/BraveSoftware/Brave-Browser/User Data/NativeMessagingHosts/`
- **Edge**: `~/AppData/Local/Microsoft/Edge/User Data/NativeMessagingHosts/`

### Linux
- **Chrome**: `~/.config/google-chrome/NativeMessagingHosts/`
- **Brave**: `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/`

## Build System Architecture

```
Root Scripts (scripts/)
├── setup.js              # Complete project setup
├── dev-tools.js          # Development utilities  
├── validate-build.js     # Build validation
└── README.md             # This file

Native Host Scripts (native-host/scripts/)
└── install-host.js       # Native messaging host installation

Build Outputs
├── extension/dist/       # Built browser extension
└── native-host/dist/     # Compiled native host
```

## Dependencies

### Required for Development
- **Node.js 16+**: Runtime for build scripts and native host
- **npm**: Package management and workspace support
- **TypeScript**: Compilation for both extension and native host
- **Webpack**: Extension bundling and asset copying

### Optional Development Tools
- **concurrently**: Parallel development watching
- **Git**: Version control (recommended)

## Integration with Package.json

The build system integrates with the root `package.json` through:
- **Workspaces**: Manages extension and native-host as separate packages
- **postinstall**: Runs complete setup automatically on `npm install`
- **Scripts**: Provides consistent commands across all development tasks

## Common Issues & Solutions

### Extension Won't Load
1. Check build: `npm run extension-status`
2. Rebuild: `npm run build:extension`
3. Follow loading guide: `npm run load-instructions`

### Native Host Connection Failed
1. Check installation: `npm run native-host-status`
2. Reinstall: `npm run install-native-host`
3. Verify permissions: Check executable bits on native host

### Development Environment Issues
1. Clean restart: `npm run prepare-dev`
2. Check status: `node scripts/dev-tools.js status`
3. Debug guide: `npm run dev-tools debug`

## Future Enhancements

### Planned Features
- [ ] Automated testing integration
- [ ] CI/CD pipeline scripts
- [ ] Browser extension store packaging
- [ ] Windows/Linux native host testing
- [ ] Performance monitoring during development

### Extension Capabilities
- [ ] Firefox manifest V2 compatibility
- [ ] Safari extension support
- [ ] Distribution packaging automation
- [ ] Update mechanism integration
