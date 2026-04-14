type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Formats a log entry as a human-readable string.
 * Swap this function (or replace the sink calls below) to emit structured
 * JSON, ship to a telemetry backend, etc.
 */
function format(
  level: LogLevel,
  context: string,
  message: string,
  data?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const dataStr = data && Object.keys(data).length > 0 ? `  ${JSON.stringify(data)}` : '';
  return `${ts}  ${level.padEnd(5)}  [${context}] ${message}${dataStr}`;
}

export function createLogger(context: string): Logger {
  return {
    info(message, data) {
      console.log(format('INFO', context, message, data));
    },
    warn(message, data) {
      console.warn(format('WARN', context, message, data));
    },
    error(message, data) {
      console.error(format('ERROR', context, message, data));
    },
  };
}
