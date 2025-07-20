# Error Handling and Logging Implementation

This document describes the comprehensive error handling and logging system implemented for the Browser Volume Controller project.

## Overview

The system provides robust error handling and structured logging across both the browser extension and native messaging host components, with debug modes, user-friendly error messages, and comprehensive logging for troubleshooting.

## Architecture

### Components

1. **Native Host Logger** (`native-host/src/logger.ts`)
   - Structured logging with multiple levels (ERROR, WARN, INFO, DEBUG)
   - File-based logging with rotation
   - Performance timing utilities
   - Debug mode support via environment variables

2. **Extension Error Handler** (`extension/src/error-handler.ts`)
   - User-friendly error message translation
   - Retry mechanisms with exponential backoff
   - Connection status monitoring
   - Error classification and recovery strategies

3. **Error UI Components** (Updated in `popup.html` and `styles.css`)
   - Connection status indicators
   - Error display panels
   - Recent errors history
   - Debug information display

## Native Host Logging System

### Features

#### Log Levels
- **ERROR**: Critical errors that may stop functionality
- **WARN**: Warning conditions that should be investigated
- **INFO**: General informational messages
- **DEBUG**: Detailed debugging information (only in debug mode)

#### File Logging
- **Location**: `/tmp/browser-volume-host.log` (macOS/Linux) or `%TEMP%\browser-volume-host.log` (Windows)
- **Rotation**: Automatic rotation when files exceed 10MB
- **Retention**: Keeps up to 5 backup files
- **Format**: Structured JSON logs with timestamps and context

#### Performance Tracking
- Timer utilities for measuring operation duration
- Automatic performance logging in debug mode
- Context-aware performance measurements

#### Debug Mode
- Enabled via `BROWSER_VOLUME_DEBUG=true` environment variable
- Increases log level to DEBUG
- Enables performance tracking
- Provides verbose operation logging

### Usage Examples

```typescript
import { getLogger } from './logger';

const logger = getLogger();

// Basic logging
logger.info('Operation completed', { count: 5 });
logger.error('Operation failed', error);

// Performance measurement
const result = await logger.timeAsync('audio-scan', async () => {
  return await scanAudioSources();
});

// Manual timing
const timerId = logger.startTimer('custom-operation');
// ... do work ...
logger.endTimer(timerId, 'custom-operation');
```

### Configuration

```typescript
const logger = new Logger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: true,
  logFile: '/custom/path/app.log',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxBackups: 3,
  enablePerformance: false
});
```

## Extension Error Handling System

### Error Types

- **NATIVE_MESSAGING**: Communication failures with native host
- **AUDIO_CONTROL**: Audio system control failures
- **PERMISSION**: Browser permission issues
- **NETWORK**: Network-related errors
- **VALIDATION**: Input validation failures
- **UNKNOWN**: Unclassified errors

### Error Severity Levels

- **LOW**: Minor issues that don't affect core functionality
- **MEDIUM**: Issues that affect some functionality
- **HIGH**: Serious issues that significantly impact functionality
- **CRITICAL**: Fatal errors that prevent core functionality

### Features

#### User-Friendly Error Messages
Automatically translates technical errors to user-understandable messages:

```typescript
// Technical error: "native host not found"
// User message: "Audio control service is not installed. Please reinstall the extension."
```

#### Retry Mechanisms
- Configurable retry attempts with exponential backoff
- Different retry strategies for different error types
- Automatic retry for recoverable errors

#### Connection Status Monitoring
- Real-time connection status tracking
- Visual indicators in popup UI
- Automatic reconnection attempts

#### Error History
- Maintains history of recent errors
- Error classification and reporting
- Context preservation for debugging

### Usage Examples

```typescript
import { getErrorHandler, ErrorType, ErrorSeverity } from './error-handler';

const errorHandler = getErrorHandler();

// Handle errors with context
try {
  await riskyOperation();
} catch (error) {
  const extensionError = errorHandler.handleError(
    error,
    ErrorType.AUDIO_CONTROL,
    ErrorSeverity.MEDIUM,
    { operation: 'setVolume', tabId: 123 }
  );
  // Error is logged and user-friendly message is generated
}

// Retry operations
const result = await errorHandler.retry(
  () => connectToNativeHost(),
  'native_messaging',
  { maxAttempts: 3, baseDelay: 1000 }
);

// Wrap operations with error handling
const result = await errorHandler.wrapOperation(
  () => performAudioOperation(),
  'audio_control',
  ErrorType.AUDIO_CONTROL,
  ErrorSeverity.HIGH,
  true // retryable
);
```

## Debug Mode

### Enabling Debug Mode

Set the environment variable before starting the native host:

```bash
# Enable debug mode
export BROWSER_VOLUME_DEBUG=true
npm run dev:native

# Or run directly
BROWSER_VOLUME_DEBUG=true node native-host/dist/index.js
```

### Debug Mode Features

1. **Verbose Logging**: All log levels including DEBUG messages
2. **Performance Tracking**: Automatic timing of all operations
3. **Message Protocol Debugging**: Detailed logging of message exchange
4. **Error Stack Traces**: Full stack traces in logs
5. **Operation Context**: Additional context for all operations

### Debug Output Example

```
[2025-07-20T00:02:15.428Z] [INFO] Logger initialized {"debugMode":true,"logFile":"/tmp/browser-volume-host.log","level":"DEBUG"}
[2025-07-20T00:02:15.431Z] [INFO] [BrowserVolumeHost] Initializing BrowserVolumeHost
[2025-07-20T00:02:15.432Z] [DEBUG] [PERF] Started timer for getAudioSources {"timerId":"getAudioSources_1752969735432_0.30923658064413795"}
[2025-07-20T00:02:15.432Z] [DEBUG] [VolumeController] Retrieving audio sources
[2025-07-20T00:02:15.432Z] [DEBUG] [MacOSAudioController] Getting browser processes
[2025-07-20T00:02:15.434Z] [DEBUG] [PERF] Performance measurement PERF: getAudioSources took 2ms
```

## Error UI Components

### Connection Status Indicator
- Real-time visual status (connected/disconnected/connecting/error)
- Color-coded status dots
- Status text descriptions

### Error Display Panel
- User-friendly error messages
- Retry and dismiss actions
- Technical details in expandable section
- Error stack traces for debugging

### Recent Errors Panel
- History of recent issues
- Clear all errors functionality
- Timestamp and severity information

## Testing

### Test Coverage

The error handling and logging systems include comprehensive tests:

#### Native Host Logger Tests (`native-host/src/logger.test.ts`)
- Log file creation and writing
- Error logging with stack traces
- Log level filtering
- Performance timing
- Debug mode functionality
- Sensitive data sanitization

#### Extension Error Handler Tests (`extension/src/error-handler.test.ts`)
- Error handling and categorization
- User-friendly message generation
- Error history tracking
- Connection status management
- Retry mechanisms
- Error context sanitization

### Running Tests

```bash
# Run all tests
npm test

# Run specific component tests
npm run test:native
npm run test:extension
```

## Security Considerations

### Data Sanitization
- Automatic redaction of sensitive information (passwords, tokens, keys)
- Safe JSON serialization to prevent circular references
- Context sanitization before logging

### Log File Security
- Appropriate file permissions on log files
- Prevention of log injection attacks
- No logging of user credentials or sensitive data

### Error Message Safety
- User messages don't expose system internals
- Technical details only available in debug mode
- No sensitive information in user-facing errors

## Performance Considerations

### Logging Performance
- Minimal overhead when debug mode is disabled
- Asynchronous file writing where possible
- Log rotation to prevent disk space issues

### Error Handling Performance
- Fast-path for non-retryable errors
- Efficient error classification
- Minimal memory usage for error history

### Debug Mode Impact
- Performance tracking only enabled in debug mode
- Additional logging has minimal production impact
- Debug features can be completely disabled

## Configuration Options

### Logger Configuration
```typescript
interface LoggerConfig {
  level: LogLevel;              // Minimum log level
  enableConsole: boolean;       // Log to console
  enableFile: boolean;          // Log to file
  logFile?: string;            // Custom log file path
  maxFileSize: number;         // Max file size before rotation
  maxBackups: number;          // Number of backup files to keep
  enablePerformance: boolean;   // Enable performance tracking
}
```

### Error Handler Configuration
```typescript
interface RetryConfig {
  maxAttempts: number;          // Maximum retry attempts
  baseDelay: number;           // Base delay between retries (ms)
  maxDelay: number;            // Maximum delay between retries (ms)
  backoffMultiplier: number;   // Exponential backoff multiplier
}
```

## Troubleshooting

### Common Issues

1. **Log files not created**
   - Check file system permissions
   - Verify log directory exists
   - Check disk space availability

2. **Debug mode not working**
   - Verify `BROWSER_VOLUME_DEBUG=true` is set
   - Restart native host after setting environment variable
   - Check log file for debug messages

3. **Extension errors not displaying**
   - Check browser console for JavaScript errors
   - Verify extension permissions
   - Check popup HTML elements exist

### Log File Locations

- **macOS/Linux**: `/tmp/browser-volume-host.log`
- **Windows**: `%TEMP%\browser-volume-host.log`

### Debug Commands

```bash
# View recent log entries
tail -f /tmp/browser-volume-host.log

# Test native messaging directly
echo '{"action":"getAudioSources"}' | node native-host/dist/index.js

# Check extension console in Chrome DevTools
# Extensions → Browser Volume Controller → background page → Console
```

## Integration Examples

### Background Script Integration

```typescript
// Enhanced connection with error handling
function connectToNativeHost(): Promise<chrome.runtime.Port> {
  return wrapOperation(
    async () => {
      // Connection logic with status updates
      errorHandler.updateConnectionStatus({ status: 'connecting' });
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      errorHandler.updateConnectionStatus({ 
        isConnected: true, 
        status: 'connected' 
      });
      return port;
    },
    'connectToNativeHost',
    ErrorType.NATIVE_MESSAGING,
    ErrorSeverity.HIGH,
    true // retryable
  );
}
```

### Audio Controller Integration

```typescript
// Enhanced audio operations with logging
async setVolume(sourceId: string, volume: number): Promise<void> {
  return this.logger.timeAsync(
    `setVolume_${sourceId}`,
    async () => {
      this.logger.debug('Setting volume', { sourceId, volume });
      await this.audioController.setVolume(sourceId, volume);
      this.logger.info('Volume set successfully', { sourceId, volume });
    }
  );
}
```

This comprehensive error handling and logging system provides robust debugging capabilities, user-friendly error reporting, and detailed operational visibility for the Browser Volume Controller project.
