import { LogLevel, Logger } from '@medplum/core';

export const globalLogger = new Logger(
  (msg) => console.log(msg),
  undefined,
  process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO
);
