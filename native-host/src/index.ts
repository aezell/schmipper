#!/usr/bin/env node

// Native messaging host for browser volume control
// Communicates with browser extension via stdin/stdout with robust messaging protocol

import { createAudioController, AudioController, AudioSource } from './audio';
import { 
  NativeMessagingProtocol, 
  RequestMessage, 
  MessageValidator
} from './messaging';
import { getLogger, Logger } from './logger';

class VolumeController {
  private audioController: AudioController;
  private logger: Logger;

  constructor() {
    this.logger = getLogger();
    
    try {
      this.audioController = createAudioController();
      this.logger.info('Audio controller initialized', undefined, 'VolumeController');
    } catch (error) {
      this.logger.error('Failed to initialize audio controller', error, 'VolumeController');
      throw error;
    }
  }

  async setVolume(sourceId: string, volume: number): Promise<void> {
    return this.logger.timeAsync(
      `setVolume_${sourceId}`,
      async () => {
        this.logger.debug('Setting volume', { sourceId, volume }, 'VolumeController');
        await this.audioController.setVolume(sourceId, volume);
        this.logger.info('Volume set successfully', { sourceId, volume }, 'VolumeController');
      },
      'VolumeController'
    );
  }

  async getVolume(sourceId: string): Promise<number> {
    return this.logger.timeAsync(
      `getVolume_${sourceId}`,
      async () => {
        this.logger.debug('Getting volume', { sourceId }, 'VolumeController');
        const volume = await this.audioController.getVolume(sourceId);
        this.logger.debug('Retrieved volume', { sourceId, volume }, 'VolumeController');
        return volume;
      },
      'VolumeController'
    );
  }

  async setMute(sourceId: string, muted: boolean): Promise<void> {
    return this.logger.timeAsync(
      `setMute_${sourceId}`,
      async () => {
        this.logger.debug('Setting mute state', { sourceId, muted }, 'VolumeController');
        await this.audioController.setMute(sourceId, muted);
        this.logger.info('Mute state set successfully', { sourceId, muted }, 'VolumeController');
      },
      'VolumeController'
    );
  }

  async getAudioSources(): Promise<AudioSource[]> {
    return this.logger.timeAsync(
      'getAudioSources',
      async () => {
        this.logger.debug('Retrieving audio sources', undefined, 'VolumeController');
        const sources = await this.audioController.getAudioSources();
        this.logger.info('Retrieved audio sources', { count: sources.length }, 'VolumeController');
        return sources;
      },
      'VolumeController'
    );
  }

  async getBrowserProcesses(): Promise<Array<{ pid: number; name: string; browser: string }>> {
    return this.logger.timeAsync(
      'getBrowserProcesses',
      async () => {
        this.logger.debug('Retrieving browser processes', undefined, 'VolumeController');
        const processes = await this.audioController.getBrowserProcesses();
        this.logger.info('Retrieved browser processes', { count: processes.length }, 'VolumeController');
        return processes;
      },
      'VolumeController'
    );
  }
}

class BrowserVolumeHost {
  private controller: VolumeController;
  private messaging: NativeMessagingProtocol;
  private logger: Logger;

  constructor() {
    this.logger = getLogger();
    
    try {
      this.logger.info('Initializing BrowserVolumeHost', undefined, 'BrowserVolumeHost');
      this.controller = new VolumeController();
      this.messaging = new NativeMessagingProtocol();
      this.setupMessageHandlers();
      this.logger.info('BrowserVolumeHost initialized successfully', undefined, 'BrowserVolumeHost');
    } catch (error) {
      this.logger.error('Failed to initialize BrowserVolumeHost', error, 'BrowserVolumeHost');
      throw error;
    }
  }

  private setupMessageHandlers(): void {
    this.messaging.on('message', (message: RequestMessage) => {
      this.handleMessage(message);
    });

    this.messaging.on('error', (error: Error) => {
      this.logger.error('Messaging error', error, 'BrowserVolumeHost');
      
      // Send error response if possible
      try {
        const response = MessageValidator.createErrorResponse(undefined, error);
        this.messaging.sendResponse(response);
        this.logger.debug('Sent error response', { error: error.message }, 'BrowserVolumeHost');
      } catch (sendError) {
        this.logger.error('Failed to send error response', sendError, 'BrowserVolumeHost');
      }
    });

    this.messaging.on('disconnect', () => {
      this.logger.info('Extension disconnected, shutting down', undefined, 'BrowserVolumeHost');
      this.shutdown();
    });

    // Log message activity for debugging
    this.messaging.on('messageSent', (message) => {
      this.logger.debug('Sent message', { 
        action: message.action || 'unknown', 
        id: message.id 
      }, 'BrowserVolumeHost');
    });

    this.messaging.on('responseSent', (response) => {
      this.logger.debug('Sent response', { 
        success: response.success ? 'success' : 'error', 
        requestId: response.requestId 
      }, 'BrowserVolumeHost');
    });
  }

  private handleMessage(message: RequestMessage): void {
    this.logger.info('Received message', { 
      action: message.action, 
      id: message.id,
      sourceId: message.sourceId 
    }, 'BrowserVolumeHost');

    this.messaging.validateAndRespond(message, async () => {
      return await this.processMessage(message);
    });
  }

  private async processMessage(message: RequestMessage): Promise<any> {
    const timerId = this.logger.startTimer(`processMessage_${message.action}`);
    
    try {
      switch (message.action) {
        case 'setTabVolume':
          // Map setTabVolume to setVolume for backward compatibility
          if (message.sourceId && message.volume !== undefined) {
            await this.controller.setVolume(message.sourceId, message.volume);
            this.logger.info('Volume set via setTabVolume', { 
              sourceId: message.sourceId, 
              volume: message.volume 
            }, 'BrowserVolumeHost');
            return { success: true };
          }
          throw new Error('Missing sourceId or volume for setTabVolume');

        case 'getVolume':
          if (!message.sourceId) {
            throw new Error('Missing sourceId for getVolume');
          }
          const volume = await this.controller.getVolume(message.sourceId);
          return { volume };

        case 'setMute':
          if (!message.sourceId || message.muted === undefined) {
            throw new Error('Missing sourceId or muted for setMute');
          }
          await this.controller.setMute(message.sourceId, message.muted);
          this.logger.info('Mute state set', { 
            sourceId: message.sourceId, 
            muted: message.muted 
          }, 'BrowserVolumeHost');
          return { success: true };

        case 'getAudioSources':
          const audioSources = await this.controller.getAudioSources();
          return { sources: audioSources, count: audioSources.length };

        case 'getBrowserProcesses':
          const processes = await this.controller.getBrowserProcesses();
          return { processes, count: processes.length };

        default:
          const error = new Error(`Unknown action: ${message.action}`);
          this.logger.error('Unknown message action', error, 'BrowserVolumeHost');
          throw error;
      }
    } finally {
      this.logger.endTimer(timerId, `processMessage_${message.action}`, 'BrowserVolumeHost');
    }
  }

  start(): void {
    this.logger.info('Browser Volume Host starting up...', undefined, 'BrowserVolumeHost');
    
    // Initialize audio controller
    try {
      // Test audio controller initialization
      this.controller.getAudioSources()
        .then(sources => {
          this.logger.info('Audio controller initialized', { 
            sourceCount: sources.length 
          }, 'BrowserVolumeHost');
        })
        .catch(error => {
          this.logger.warn('Audio controller initialization warning', error, 'BrowserVolumeHost');
        });
    } catch (error) {
      this.logger.error('Failed to initialize audio controller', error, 'BrowserVolumeHost');
    }

    this.logger.info('Native messaging host ready', undefined, 'BrowserVolumeHost');
  }

  private shutdown(): void {
    this.logger.info('Shutting down Browser Volume Host', undefined, 'BrowserVolumeHost');
    this.logger.shutdown();
    process.exit(0);
  }
}

// Setup global error handling with logger
const globalLogger = getLogger();

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  globalLogger.error('Uncaught exception', error, 'GLOBAL');
  globalLogger.shutdown();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  globalLogger.error('Unhandled rejection', { reason, promise }, 'GLOBAL');
  globalLogger.shutdown();
  process.exit(1);
});

// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  globalLogger.info('Received SIGTERM, shutting down gracefully', undefined, 'GLOBAL');
  globalLogger.shutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  globalLogger.info('Received SIGINT, shutting down gracefully', undefined, 'GLOBAL');
  globalLogger.shutdown();
  process.exit(0);
});

// Start the native messaging host
try {
  const host = new BrowserVolumeHost();
  host.start();
} catch (error) {
  globalLogger.error('Failed to start Browser Volume Host', error, 'GLOBAL');
  process.exit(1);
}
