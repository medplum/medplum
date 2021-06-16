import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
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
  return `[${info.level.toUpperCase()}] ${info.timestamp} ${info.message}`;
}
