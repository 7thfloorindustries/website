/**
 * Structured logging utility.
 *
 * - Production (NODE_ENV === 'production'): JSON lines
 * - Development: human-readable colored output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

type LogContext = Record<string, unknown>;

interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  withContext(context: LogContext): Logger;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',   // cyan
  info: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
};
const RESET = '\x1b[0m';

const isProduction = process.env.NODE_ENV === 'production';

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function formatDev(entry: LogEntry): string {
  const { timestamp, level, message, ...rest } = entry;
  const color = LEVEL_COLORS[level];
  const ts = timestamp.slice(11, 23); // HH:mm:ss.SSS
  const ctx = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${color}[${level.toUpperCase().padEnd(5)}]${RESET} ${ts} ${message}${ctx}`;
}

function emit(level: LogLevel, entry: LogEntry): void {
  const line = isProduction ? formatJson(entry) : formatDev(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function createLogger(baseContext: LogContext = {}): Logger {
  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseContext,
      ...context,
    };
    emit(level, entry);
  }

  return {
    debug: (msg, ctx?) => log('debug', msg, ctx),
    info: (msg, ctx?) => log('info', msg, ctx),
    warn: (msg, ctx?) => log('warn', msg, ctx),
    error: (msg, ctx?) => log('error', msg, ctx),
    withContext(context: LogContext): Logger {
      return createLogger({ ...baseContext, ...context });
    },
  };
}

export const logger = createLogger();
export type { Logger, LogContext };
