import { EventEmitter } from 'events';

// Message types for communication between extension and native host
export interface BaseMessage {
  id?: string;
  timestamp?: number;
}

export interface RequestMessage extends BaseMessage {
  action: 'getAudioSources' | 'setTabVolume' | 'getVolume' | 'setMute' | 'getBrowserProcesses';
  sourceId?: string;
  tabId?: string;
  volume?: number;
  muted?: boolean;
  timeout?: number;
}

export interface ResponseMessage extends BaseMessage {
  success: boolean;
  requestId?: string;
  data?: any;
  error?: string;
}

// Message validation schemas
const MESSAGE_SCHEMAS = {
  getAudioSources: {
    required: [],
    optional: ['timeout']
  },
  setTabVolume: {
    required: ['sourceId', 'volume'],
    optional: ['tabId', 'timeout']
  },
  getVolume: {
    required: ['sourceId'],
    optional: ['timeout']
  },
  setMute: {
    required: ['sourceId', 'muted'],
    optional: ['timeout']
  },
  getBrowserProcesses: {
    required: [],
    optional: ['timeout']
  }
};

export class MessageValidationError extends Error {
  public field?: string;
  public value?: any;

  constructor(message: string, field?: string, value?: any) {
    super(message);
    this.name = 'MessageValidationError';
    this.field = field;
    this.value = value;
  }
}

export class MessageValidator {
  static validateRequest(message: RequestMessage): void {
    if (!message.action) {
      throw new MessageValidationError('Missing required field: action');
    }

    const schema = MESSAGE_SCHEMAS[message.action];
    if (!schema) {
      throw new MessageValidationError(`Unknown action: ${message.action}`);
    }

    // Check required fields
    for (const field of schema.required) {
      if (!(field in message) || message[field as keyof RequestMessage] === undefined) {
        throw new MessageValidationError(
          `Missing required field: ${field}`,
          field,
          message[field as keyof RequestMessage]
        );
      }
    }

    // Validate field types and values
    if ('volume' in message && message.volume !== undefined) {
      if (typeof message.volume !== 'number' || message.volume < 0 || message.volume > 100) {
        throw new MessageValidationError(
          'Volume must be a number between 0 and 100',
          'volume',
          message.volume
        );
      }
    }

    if ('muted' in message && message.muted !== undefined) {
      if (typeof message.muted !== 'boolean') {
        throw new MessageValidationError(
          'Muted must be a boolean',
          'muted',
          message.muted
        );
      }
    }

    if ('sourceId' in message && message.sourceId !== undefined) {
      if (typeof message.sourceId !== 'string' || message.sourceId.trim() === '') {
        throw new MessageValidationError(
          'SourceId must be a non-empty string',
          'sourceId',
          message.sourceId
        );
      }
    }
  }

  static createErrorResponse(requestId: string | undefined, error: Error): ResponseMessage {
    return {
      success: false,
      requestId,
      error: error.message,
      timestamp: Date.now()
    };
  }

  static createSuccessResponse(requestId: string | undefined, data?: any): ResponseMessage {
    return {
      success: true,
      requestId,
      data,
      timestamp: Date.now()
    };
  }
}

export class NativeMessagingProtocol extends EventEmitter {
  private messageBuffer: Buffer = Buffer.alloc(0);
  private expectedLength: number = -1;
  private isProcessing: boolean = false;
  private readonly maxMessageSize: number = 1024 * 1024; // 1MB max message size
  private readonly defaultTimeout: number = 5000; // 5 second default timeout

  constructor() {
    super();
    this.setupInputHandler();
  }

  private setupInputHandler(): void {
    process.stdin.on('readable', () => {
      this.processIncomingData();
    });

    process.stdin.on('end', () => {
      this.emit('disconnect');
      process.exit(0);
    });

    process.stdin.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private processIncomingData(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let chunk: Buffer | null;
      while ((chunk = process.stdin.read()) !== null) {
        this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);
        this.processMessages();
      }
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private processMessages(): void {
    while (true) {
      // Read message length if we don't have it yet
      if (this.expectedLength === -1) {
        if (this.messageBuffer.length < 4) {
          break; // Need more data
        }
        
        this.expectedLength = this.messageBuffer.readUInt32LE(0);
        this.messageBuffer = this.messageBuffer.slice(4);

        // Validate message size
        if (this.expectedLength > this.maxMessageSize) {
          this.emit('error', new Error(`Message too large: ${this.expectedLength} bytes`));
          this.resetMessageState();
          break;
        }
      }

      // Read message content if we have enough data
      if (this.messageBuffer.length >= this.expectedLength) {
        const messageData = this.messageBuffer.slice(0, this.expectedLength);
        this.messageBuffer = this.messageBuffer.slice(this.expectedLength);
        
        this.handleIncomingMessage(messageData);
        this.resetMessageState();
      } else {
        break; // Need more data
      }
    }
  }

  private resetMessageState(): void {
    this.expectedLength = -1;
  }

  private handleIncomingMessage(messageData: Buffer): void {
    try {
      const messageText = messageData.toString('utf8');
      const message: RequestMessage = JSON.parse(messageText);
      
      // Add timestamp if not present
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      // Generate message ID if not present
      if (!message.id) {
        message.id = this.generateMessageId();
      }

      this.emit('message', message);
    } catch (error) {
      const errorResponse = MessageValidator.createErrorResponse(
        undefined,
        new Error(`Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
      this.sendResponse(errorResponse);
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sendResponse(response: ResponseMessage): void {
    try {
      const messageText = JSON.stringify(response);
      const messageBuffer = Buffer.from(messageText, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
      
      // Write length prefix and message
      process.stdout.write(lengthBuffer);
      process.stdout.write(messageBuffer);
      
      this.emit('responseSent', response);
    } catch (error) {
      this.emit('error', new Error(`Failed to send response: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  sendMessage(message: RequestMessage): void {
    try {
      if (!message.id) {
        message.id = this.generateMessageId();
      }
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      const messageText = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageText, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
      
      process.stdout.write(lengthBuffer);
      process.stdout.write(messageBuffer);
      
      this.emit('messageSent', message);
    } catch (error) {
      this.emit('error', new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  // Utility method for request validation
  validateAndRespond(message: RequestMessage, handler: () => Promise<any>): void {
    const respond = (response: ResponseMessage) => {
      this.sendResponse(response);
    };

    try {
      // Validate the incoming message
      MessageValidator.validateRequest(message);
      
      // Set up timeout for the handler
      const timeout = message.timeout || this.defaultTimeout;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // Execute handler with timeout
      Promise.race([handler(), timeoutPromise])
        .then(result => {
          respond(MessageValidator.createSuccessResponse(message.id, result));
        })
        .catch(error => {
          respond(MessageValidator.createErrorResponse(message.id, error instanceof Error ? error : new Error(String(error))));
        });
    } catch (error) {
      respond(MessageValidator.createErrorResponse(message.id, error instanceof Error ? error : new Error(String(error))));
    }
  }
}
