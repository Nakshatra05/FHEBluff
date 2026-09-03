export const levels = { values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity } };

type Logger = Record<string, (...args: unknown[]) => void> & { child: () => Logger };
const noop = () => undefined;
export function pino(): Logger {
  const logger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop } as unknown as Logger;
  logger.child = () => logger;
  return logger;
}
export default pino;
