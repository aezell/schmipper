// Structured logging system for Browser Volume Controller Native Host
// Provides file-based logging, performance tracking, and debug modes

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  data?: any;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    operation: string;
    duration: number;
    startTime: number;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logFile?: string;
  maxFileSize: number; // bytes
  maxBackups: number;
  enablePerformance: boolean;
}

export class Logger {
  private config: LoggerConfig;
  private logFile: string;
  private performanceTracking: Map<string, number> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    const isDebugMode = process.env.BROWSER_VOLUME_DEBUG === 'true';
    
    this.config = {
      level: isDebugMode ? LogLevel.DEBUG : LogLevel.INFO,
      enableConsole: true,
      enableFile: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxBackups: 5,
      enablePerformance: isDebugMode,
      ...config
    };

    // Determine log file path based on platform
    this.logFile = this.config.logFile || this.getDefaultLogFile();
    
    // Ensure log directory exists
    this.ensureLogDirectory();
    
    this.info('Logger initialized', { 
      debugMode: isDebugMode,
      logFile: this.logFile,
      level: LogLevel[this.config.level]
    });
  }

  private getDefaultLogFile(): string {
    const platform = os.platform();
    const filename = 'browser-volume-host.log';
    
    switch (platform) {
      case 'win32':
        return path.join(os.tmpdir(), filename);
      case 'darwin':
      case 'linux':
      default:
        return path.join('/tmp', filename);
    }
  }

  private ensureLogDirectory(): void {
    try {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private formatLogEntry(entry: LogEntry): string {
    const parts = [`[${entry.timestamp}] [${entry.level}]`];
    
    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }
    
    parts.push(entry.message);
    
    if (entry.data) {
      try {
        parts.push(JSON.stringify(entry.data, this.safeJsonReplacer));
      } catch (error) {
        parts.push('[Circular Reference]');
      }
    }
    
    if (entry.error) {
      parts.push(`ERROR: ${entry.error.message}`);
      if (entry.error.code) {
        parts.push(`CODE: ${entry.error.code}`);
      }
      if (entry.error.stack && this.config.level >= LogLevel.DEBUG) {
        parts.push(`STACK: ${entry.error.stack}`);
      }
    }
    
    if (entry.performance) {
      const { operation, duration } = entry.performance;
      parts.push(`PERF: ${operation} took ${duration}ms`);
    }
    
    return parts.join(' ');
  }

  private safeJsonReplacer(key: string, value: any): any {
    // Prevent logging sensitive information
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      return '[REDACTED]';
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (value.constructor && value.constructor.name && 
          ['Function', 'GeneratorFunction', 'AsyncFunction'].includes(value.constructor.name)) {
        return '[Function]';
      }
    }
    
    return value;
  }

  private writeToFile(logLine: string): void {
    if (!this.config.enableFile) return;
    
    try {
      // Check file size and rotate if necessary
      this.rotateLogIfNeeded();
      
      fs.appendFileSync(this.logFile, logLine + '\n', { encoding: 'utf8' });
    } catch (error) {
      // Only output to console if file logging fails
      if (this.config.enableConsole) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  private rotateLogIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFile)) return;
      
      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.config.maxFileSize) {
        // Rotate logs
        for (let i = this.config.maxBackups; i > 0; i--) {
          const oldFile = `${this.logFile}.${i}`;
          const newFile = `${this.logFile}.${i + 1}`;
          
          if (fs.existsSync(oldFile)) {
            if (i === this.config.maxBackups) {
              fs.unlinkSync(oldFile); // Delete oldest
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }
        
        // Move current log to .1
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private log(level: LogLevel, message: string, data?: any, context?: string): void {
    if (!this.shouldLog(level)) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      context,
      message,
      data
    };
    
    const logLine = this.formatLogEntry(entry);
    
    if (this.config.enableConsole) {
      const consoleMethod = level <= LogLevel.WARN ? console.error : console.log;
      consoleMethod(logLine);
    }
    
    this.writeToFile(logLine);
  }

  public error(message: string, error?: Error | any, context?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context,
      message
    };
    
    if (error) {
      if (error instanceof Error) {
        entry.error = {
          message: error.message,
          stack: error.stack,
          code: (error as any).code
        };
      } else {
        entry.data = error;
      }
    }
    
    const logLine = this.formatLogEntry(entry);
    
    if (this.config.enableConsole) {
      console.error(logLine);
    }
    
    this.writeToFile(logLine);
  }

  public warn(message: string, data?: any, context?: string): void {
    this.log(LogLevel.WARN, message, data, context);
  }

  public info(message: string, data?: any, context?: string): void {
    this.log(LogLevel.INFO, message, data, context);
  }

  public debug(message: string, data?: any, context?: string): void {
    this.log(LogLevel.DEBUG, message, data, context);
  }

  // Performance tracking methods
  public startTimer(operation: string): string {
    const timerId = `${operation}_${Date.now()}_${Math.random()}`;
    this.performanceTracking.set(timerId, Date.now());
    
    if (this.config.enablePerformance) {
      this.debug(`Started timer for ${operation}`, { timerId }, 'PERF');
    }
    
    return timerId;
  }

  public endTimer(timerId: string, operation: string, context?: string): number {
    const startTime = this.performanceTracking.get(timerId);
    if (!startTime) {
      this.warn('Timer not found', { timerId, operation }, 'PERF');
      return 0;
    }
    
    const duration = Date.now() - startTime;
    this.performanceTracking.delete(timerId);
    
    if (this.config.enablePerformance) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        context: context || 'PERF',
        message: `Performance measurement`,
        performance: {
          operation,
          duration,
          startTime
        }
      };
      
      const logLine = this.formatLogEntry(entry);
      
      if (this.config.enableConsole) {
        console.log(logLine);
      }
      
      this.writeToFile(logLine);
    }
    
    return duration;
  }

  // Utility method for timing async operations
  public async timeAsync<T>(operation: string, fn: () => Promise<T>, context?: string): Promise<T> {
    const timerId = this.startTimer(operation);
    try {
      const result = await fn();
      this.endTimer(timerId, operation, context);
      return result;
    } catch (error) {
      this.endTimer(timerId, operation, context);
      this.error(`Operation ${operation} failed`, error, context);
      throw error;
    }
  }

  // Utility method for timing sync operations
  public timeSync<T>(operation: string, fn: () => T, context?: string): T {
    const timerId = this.startTimer(operation);
    try {
      const result = fn();
      this.endTimer(timerId, operation, context);
      return result;
    } catch (error) {
      this.endTimer(timerId, operation, context);
      this.error(`Operation ${operation} failed`, error, context);
      throw error;
    }
  }

  // Cleanup method
  public shutdown(): void {
    this.info('Logger shutting down');
    this.performanceTracking.clear();
  }
}

// Singleton logger instance
let logger: Logger | null = null;

export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!logger) {
    logger = new Logger(config);
  }
  return logger;
}

export function setLogger(newLogger: Logger): void {
  if (logger) {
    logger.shutdown();
  }
  logger = newLogger;
}

// Default export for convenience
export default getLogger;
