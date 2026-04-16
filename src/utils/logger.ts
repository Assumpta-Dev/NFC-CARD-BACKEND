// ===========================================================
// LOGGER UTILITY (Winston)
// ===========================================================
// Winston is used instead of console.log because:
//   - Structured JSON logs are machine-parseable (ELK, Datadog, etc.)
//   - Log levels let you filter verbosity per environment
//   - Sensitive data policies are easier to enforce centrally
//   - Timestamps and metadata are added automatically
//
// In production, send logs to a centralized service (e.g., ELK).
// In development, human-readable colorized output is used.
// ===========================================================

import winston from 'winston';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

// Determine the active environment from env vars
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const logger = winston.createLogger({
  // Log level hierarchy: error > warn > info > http > debug
  // Setting 'debug' in dev logs everything; 'info' in prod skips debug noise
  level: logLevel,

  // Always include errors with their full stack trace so debugging is easier
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json() // Structured JSON format for production log ingestion
  ),

  // Default metadata attached to every log entry
  defaultMeta: { service: 'nfc-card-api' },

  transports: [
    // Console transport: JSON in production, colorized readable format in dev
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), json())
        : combine(colorize(), simple()), // e.g. "info: Server started on port 5000"
    }),

    // File transports: rotate logs in a real deployment (use winston-daily-rotate-file)
    // Errors are separated so they can be monitored or alerted independently
    ...(isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

// HTTP request logger helper — used by Morgan or manual middleware
// Logs each incoming request at 'http' level (filtered out in production unless needed)
export const logRequest = (method: string, url: string, status: number, duration: number) => {
  logger.http(`${method} ${url}`, { status, duration_ms: duration });
};

export default logger;
