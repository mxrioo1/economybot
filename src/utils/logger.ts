type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function write(level: Level, message: string, extra?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  const out = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  if (extra === undefined) out(line);
  else out(line, extra instanceof Error ? (extra.stack ?? extra.message) : extra);
}

export const logger = {
  debug: (m: string, e?: unknown) => process.env.DEBUG && write('DEBUG', m, e),
  info: (m: string, e?: unknown) => write('INFO', m, e),
  warn: (m: string, e?: unknown) => write('WARN', m, e),
  error: (m: string, e?: unknown) => write('ERROR', m, e),
};
