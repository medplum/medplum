import winston from 'winston';

export const logger = winston.createLogger({
  level: 'debug',
  silent: process.env.NODE_ENV === 'test',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.printf(logFormat),
  ),
  transports: [
    new winston.transports.Console()
  ]
});

function logFormat(info: winston.Logform.TransformableInfo): string {
  const {level, message, timestamp, stack} = info;
  if (stack) {
    return `[${level.toUpperCase()}] ${timestamp} ${message}\n${stack}`;
  }
  return `[${level.toUpperCase()}] ${timestamp} ${message}`;
}
