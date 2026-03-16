export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return "";
  return (
    " " +
    args
      .map((a) => {
        if (typeof a === "object" && a !== null) {
          try {
            return JSON.stringify(a, null, 2);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(" ")
  );
}

function timestamp(): string {
  return new Date().toISOString();
}

export function createLogger(): Logger {
  const prefix = "[asteria-ai-worker]";

  return {
    info(message: string, ...args: unknown[]): void {
      console.log(`${prefix} [${timestamp()}] INFO  ${message}${formatArgs(args)}`);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(`${prefix} [${timestamp()}] WARN  ${message}${formatArgs(args)}`);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(`${prefix} [${timestamp()}] ERROR ${message}${formatArgs(args)}`);
    },
    debug(message: string, ...args: unknown[]): void {
      if (process.env["DEBUG"]) {
        console.log(`${prefix} [${timestamp()}] DEBUG ${message}${formatArgs(args)}`);
      }
    },
  };
}
