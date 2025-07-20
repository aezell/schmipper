// Error handling system for Browser Volume Controller Extension
// Provides user-friendly error messages, retry mechanisms, and connection monitoring

export enum ErrorType {
  NATIVE_MESSAGING = 'native_messaging',
  AUDIO_CONTROL = 'audio_control',
  PERMISSION = 'permission',
  NETWORK = 'network',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ExtensionError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  code?: string;
  retryable: boolean;
  context?: any;
  timestamp: number;
  stack?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ConnectionStatus {
  isConnected: boolean;
  lastError?: string;
  lastConnectAttempt: number;
  connectionAttempts: number;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
}

export class ErrorHandler {
  private errors: ExtensionError[] = [];
  private maxErrorHistory = 50;
  private retryConfigs = new Map<string, RetryConfig>();
  private activeRetries = new Map<string, number>();
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    lastConnectAttempt: 0,
    connectionAttempts: 0,
    status: 'disconnected'
  };

  constructor() {
    this.setupDefaultRetryConfigs();
    this.setupErrorReporting();
  }

  private setupDefaultRetryConfigs(): void {
    this.retryConfigs.set('native_messaging', {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2
    });

    this.retryConfigs.set('audio_control', {
      maxAttempts: 2,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 1.5
    });

    this.retryConfigs.set('permission', {
      maxAttempts: 1,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1
    });
  }

  private setupErrorReporting(): void {
    // Listen for unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(
          new Error(event.reason),
          ErrorType.UNKNOWN,
          ErrorSeverity.HIGH,
          { source: 'unhandledrejection' }
        );
      });

      window.addEventListener('error', (event) => {
        this.handleError(
          new Error(event.message),
          ErrorType.UNKNOWN,
          ErrorSeverity.MEDIUM,
          { 
            source: 'window_error',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        );
      });
    }
  }

  public handleError(
    error: Error | any,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: any
  ): ExtensionError {
    const extensionError: ExtensionError = {
      type,
      severity,
      message: error?.message || String(error),
      userMessage: this.getUserFriendlyMessage(error, type),
      code: error?.code,
      retryable: this.isRetryable(error, type),
      context: this.sanitizeContext(context),
      timestamp: Date.now(),
      stack: error?.stack
    };

    this.addToErrorHistory(extensionError);
    this.logError(extensionError);

    // Handle specific error types
    if (type === ErrorType.NATIVE_MESSAGING) {
      this.handleNativeMessagingError(extensionError);
    }

    return extensionError;
  }

  private getUserFriendlyMessage(error: any, type: ErrorType): string {
    // Map technical errors to user-friendly messages
    const errorPatterns = [
      // Native messaging errors
      {
        pattern: /native.*host.*not.*found/i,
        message: 'Audio control service is not installed. Please reinstall the extension.'
      },
      {
        pattern: /native.*host.*disconnected/i,
        message: 'Lost connection to audio service. Trying to reconnect...'
      },
      {
        pattern: /permission.*denied/i,
        message: 'Permission denied. Please check browser permissions for this extension.'
      },
      {
        pattern: /access.*denied/i,
        message: 'Access denied. The extension may need additional permissions.'
      },
      // Audio control errors
      {
        pattern: /audio.*source.*not.*found/i,
        message: 'Audio source not found. The tab may have stopped playing audio.'
      },
      {
        pattern: /volume.*control.*failed/i,
        message: 'Failed to adjust volume. Please try again.'
      },
      {
        pattern: /mute.*control.*failed/i,
        message: 'Failed to mute/unmute audio. Please try again.'
      },
      // General errors
      {
        pattern: /timeout/i,
        message: 'Operation timed out. Please try again.'
      },
      {
        pattern: /network.*error/i,
        message: 'Network error occurred. Please check your connection.'
      }
    ];

    const errorMessage = error?.message || String(error);
    
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(errorMessage)) {
        return message;
      }
    }

    // Type-specific fallbacks
    switch (type) {
      case ErrorType.NATIVE_MESSAGING:
        return 'Unable to communicate with audio control service. Please try restarting the browser.';
      case ErrorType.AUDIO_CONTROL:
        return 'Failed to control audio. Please try again.';
      case ErrorType.PERMISSION:
        return 'Permission required. Please check extension permissions.';
      case ErrorType.VALIDATION:
        return 'Invalid input provided. Please check your settings.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  private isRetryable(error: any, type: ErrorType): boolean {
    const errorMessage = error?.message || String(error);
    
    // Non-retryable patterns
    const nonRetryablePatterns = [
      /permission.*denied/i,
      /access.*denied/i,
      /not.*installed/i,
      /invalid.*parameter/i,
      /validation.*failed/i
    ];

    if (nonRetryablePatterns.some(pattern => pattern.test(errorMessage))) {
      return false;
    }

    // Type-specific retry logic
    switch (type) {
      case ErrorType.PERMISSION:
        return false;
      case ErrorType.VALIDATION:
        return false;
      case ErrorType.NATIVE_MESSAGING:
      case ErrorType.AUDIO_CONTROL:
      case ErrorType.NETWORK:
        return true;
      default:
        return true;
    }
  }

  private sanitizeContext(context: any): any {
    if (!context) return undefined;

    // Remove sensitive information
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];
    
    const sanitized = JSON.parse(JSON.stringify(context, (key, value) => {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        return '[REDACTED]';
      }
      return value;
    }));

    return sanitized;
  }

  private addToErrorHistory(error: ExtensionError): void {
    this.errors.unshift(error);
    if (this.errors.length > this.maxErrorHistory) {
      this.errors = this.errors.slice(0, this.maxErrorHistory);
    }
  }

  private logError(error: ExtensionError): void {
    const logLevel = this.getLogLevel(error.severity);
    const message = `[${error.type}] ${error.message}`;
    
    if (console[logLevel]) {
      console[logLevel](message, {
        userMessage: error.userMessage,
        code: error.code,
        retryable: error.retryable,
        context: error.context,
        timestamp: new Date(error.timestamp).toISOString()
      });
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'debug';
      case ErrorSeverity.MEDIUM:
        return 'info';
      case ErrorSeverity.HIGH:
        return 'warn';
      case ErrorSeverity.CRITICAL:
        return 'error';
      default:
        return 'error';
    }
  }

  private handleNativeMessagingError(error: ExtensionError): void {
    this.connectionStatus.isConnected = false;
    this.connectionStatus.lastError = error.message;
    this.connectionStatus.status = 'error';
    
    // Notify listeners about connection status change
    this.notifyStatusChange();
  }

  // Retry mechanism
  public async retry<T>(
    operation: () => Promise<T>,
    operationType: string = 'default',
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = {
      ...this.retryConfigs.get(operationType) || this.retryConfigs.get('native_messaging')!,
      ...customConfig
    };

    let lastError: any;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Clear any pending retries for this operation
        const retryKey = `${operationType}_${Date.now()}`;
        if (this.activeRetries.has(retryKey)) {
          clearTimeout(this.activeRetries.get(retryKey)!);
          this.activeRetries.delete(retryKey);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === config.maxAttempts) {
          break; // Don't wait after the last attempt
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        console.warn(`Retry attempt ${attempt}/${config.maxAttempts} failed, waiting ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    
    // All retries failed
    this.handleError(
      lastError,
      operationType === 'native_messaging' ? ErrorType.NATIVE_MESSAGING : ErrorType.UNKNOWN,
      ErrorSeverity.HIGH,
      { operationType, attempts: config.maxAttempts }
    );
    
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Connection status management
  public updateConnectionStatus(status: Partial<ConnectionStatus>): void {
    this.connectionStatus = { ...this.connectionStatus, ...status };
    this.notifyStatusChange();
  }

  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  private notifyStatusChange(): void {
    // Send message to popup and other components
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'connectionStatusChanged',
        status: this.connectionStatus
      }).catch(() => {
        // Popup might not be open, ignore error
      });
    }
  }

  // Error reporting for UI
  public getRecentErrors(count: number = 10): ExtensionError[] {
    return this.errors.slice(0, count);
  }

  public clearErrors(): void {
    this.errors = [];
  }

  public hasErrors(): boolean {
    return this.errors.length > 0;
  }

  public hasCriticalErrors(): boolean {
    return this.errors.some(error => error.severity === ErrorSeverity.CRITICAL);
  }

  // Utility method for wrapping operations with error handling
  public async wrapOperation<T>(
    operation: () => Promise<T>,
    operationType: string,
    errorType: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable: boolean = true
  ): Promise<T> {
    try {
      if (retryable) {
        return await this.retry(operation, operationType);
      } else {
        return await operation();
      }
    } catch (error) {
      throw this.handleError(error, errorType, severity, { operationType });
    }
  }
}

// Singleton instance
let errorHandler: ErrorHandler | null = null;

export function getErrorHandler(): ErrorHandler {
  if (!errorHandler) {
    errorHandler = new ErrorHandler();
  }
  return errorHandler;
}

export function setErrorHandler(handler: ErrorHandler): void {
  errorHandler = handler;
}

// Convenience functions
export function handleError(
  error: Error | any,
  type: ErrorType = ErrorType.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: any
): ExtensionError {
  return getErrorHandler().handleError(error, type, severity, context);
}

export function retry<T>(
  operation: () => Promise<T>,
  operationType: string = 'default',
  customConfig?: Partial<RetryConfig>
): Promise<T> {
  return getErrorHandler().retry(operation, operationType, customConfig);
}

export function wrapOperation<T>(
  operation: () => Promise<T>,
  operationType: string,
  errorType: ErrorType = ErrorType.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  retryable: boolean = true
): Promise<T> {
  return getErrorHandler().wrapOperation(operation, operationType, errorType, severity, retryable);
}

export default getErrorHandler;
