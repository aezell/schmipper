#!/usr/bin/env node

// Native messaging host for browser volume control
// Communicates with browser extension via stdin/stdout with robust messaging protocol

import { createAudioController, AudioController, AudioSource } from './audio';
import { 
  NativeMessagingProtocol, 
  RequestMessage, 
  MessageValidator
} from './messaging';

class VolumeController {
  private audioController: AudioController;

  constructor() {
    this.audioController = createAudioController();
  }

  async setVolume(sourceId: string, volume: number): Promise<void> {
    await this.audioController.setVolume(sourceId, volume);
  }

  async getVolume(sourceId: string): Promise<number> {
    return await this.audioController.getVolume(sourceId);
  }

  async setMute(sourceId: string, muted: boolean): Promise<void> {
    await this.audioController.setMute(sourceId, muted);
  }

  async getAudioSources(): Promise<AudioSource[]> {
    return await this.audioController.getAudioSources();
  }

  async getBrowserProcesses(): Promise<Array<{ pid: number; name: string; browser: string }>> {
    return await this.audioController.getBrowserProcesses();
  }
}

class BrowserVolumeHost {
  private controller: VolumeController;
  private messaging: NativeMessagingProtocol;

  constructor() {
    this.controller = new VolumeController();
    this.messaging = new NativeMessagingProtocol();
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    this.messaging.on('message', (message: RequestMessage) => {
      this.handleMessage(message);
    });

    this.messaging.on('error', (error: Error) => {
      this.logError('Messaging error:', error);
      
      // Send error response if possible
      try {
        const response = MessageValidator.createErrorResponse(undefined, error);
        this.messaging.sendResponse(response);
      } catch (sendError) {
        this.logError('Failed to send error response:', sendError);
      }
    });

    this.messaging.on('disconnect', () => {
      this.log('Extension disconnected, shutting down');
      this.shutdown();
    });

    // Optional: Log message activity for debugging
    this.messaging.on('messageSent', (message) => {
      this.log('Sent message:', message.action || 'unknown', message.id);
    });

    this.messaging.on('responseSent', (response) => {
      this.log('Sent response:', response.success ? 'success' : 'error', response.requestId);
    });
  }

  private handleMessage(message: RequestMessage): void {
    this.log('Received message:', message.action, message.id);

    this.messaging.validateAndRespond(message, async () => {
      return await this.processMessage(message);
    });
  }

  private async processMessage(message: RequestMessage): Promise<any> {
    switch (message.action) {
      case 'setTabVolume':
        // Map setTabVolume to setVolume for backward compatibility
        if (message.sourceId && message.volume !== undefined) {
          await this.controller.setVolume(message.sourceId, message.volume);
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
        return { success: true };

      case 'getAudioSources':
        const audioSources = await this.controller.getAudioSources();
        return { sources: audioSources, count: audioSources.length };

      case 'getBrowserProcesses':
        const processes = await this.controller.getBrowserProcesses();
        return { processes, count: processes.length };

      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  }

  start(): void {
    this.log('Browser Volume Host starting up...');
    
    // Initialize audio controller
    try {
      // Test audio controller initialization
      this.controller.getAudioSources()
        .then(sources => {
          this.log(`Audio controller initialized, found ${sources.length} sources`);
        })
        .catch(error => {
          this.logError('Audio controller initialization warning:', error);
        });
    } catch (error) {
      this.logError('Failed to initialize audio controller:', error);
    }

    this.log('Native messaging host ready');
  }

  private shutdown(): void {
    this.log('Shutting down Browser Volume Host');
    process.exit(0);
  }

  private log(...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [INFO]`, ...args);
  }

  private logError(...args: any[]): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR]`, ...args);
  }
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  console.error('[INFO] Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[INFO] Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the native messaging host
const host = new BrowserVolumeHost();
host.start();
