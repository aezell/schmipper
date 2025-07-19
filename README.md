# Browser Volume Controller

A cross-platform application to control individual browser window volumes via browser extension + native messaging.

## Project Structure

```
browser-volume-controller/
├── extension/           # Browser extension code
├── native-host/        # Native messaging host application
├── docs/              # Documentation and planning
└── scripts/           # Build and deployment scripts
```

## Development Setup

### Prerequisites
- [asdf](https://asdf-vm.com/) version manager (recommended)
- Chrome/Brave browser with Developer Mode enabled

### Installation

#### Using asdf (Recommended)
```bash
# Install Node.js plugin (if not already installed)
asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git

# Install the Node.js version specified in .tool-versions
asdf install

# Verify correct version
node --version    # Should show v22.12.0

# Install project dependencies
npm install
npm run build
npm run install-native-host
```

#### Alternative Setup
If you prefer managing Node.js yourself:
- Node.js 22.12.0+ (LTS recommended)
- Then run: `npm install && npm run build && npm run install-native-host`

## Architecture

- **Browser Extension**: Detects audio, provides UI, communicates with native host
- **Native Host**: Controls system audio levels for specific browser processes
- **Communication**: JSON messages via Native Messaging API
