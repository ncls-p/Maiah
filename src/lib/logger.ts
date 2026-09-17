import { env } from "./env";
import { safeLogText, safeLogValue } from "./log-safety";
import { getLogContext } from "./log-context";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  service?: string;
  requestId?: string;
  data?: Record<string, unknown>;
}

function format(entry: LogEntry): string {
  if (env.NODE_ENV === "test")
    return `${entry.level}: ${safeLogText(entry.message)}`;

  const obj = {
    ...getLogContext(),
    ...(entry.data && { ...entry.data }),
    ts: entry.timestamp,
    lvl: entry.level,
    msg: entry.message,
    ...(entry.service && { svc: entry.service }),
    ...(entry.requestId && { rid: entry.requestId }),
  };
  return JSON.stringify(safeLogValue(obj));
}

function writeLog(stream: NodeJS.WriteStream, entry: LogEntry) {
  stream.write(`${format(entry)}\n`);
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>) {
    if (env.NODE_ENV === "production" && process.env.LOG_LEVEL !== "debug")
      return;
    writeLog(process.stdout, {
      level: "debug",
      timestamp: new Date().toISOString(),
      message,
      data,
    });
  },

  info(message: string, data?: Record<string, unknown>) {
    writeLog(process.stdout, {
      level: "info",
      timestamp: new Date().toISOString(),
      message,
      data,
    });
  },

  warn(message: string, data?: Record<string, unknown>) {
    writeLog(process.stderr, {
      level: "warn",
      timestamp: new Date().toISOString(),
      message,
      data,
    });
  },

  error(message: string, data?: Record<string, unknown>, error?: Error) {
    writeLog(process.stderr, {
      level: "error",
      timestamp: new Date().toISOString(),
      message,
      data: {
        ...(data || {}),
        ...(error && { error: error.message, stack: error.stack }),
        ...(error?.cause !== undefined && { cause: error.cause }),
      },
    });
  },
};

export function logHandledWarning(
  message: string,
  data?: Record<string, unknown>,
) {
  const details = data ?? {};
  logger.warn(message, details);
}

export function logHandledError(
  message: string,
  data?: Record<string, unknown>,
  error?: Error,
) {
  const details = data ?? {};
  logger.error(message, details, error);
}
