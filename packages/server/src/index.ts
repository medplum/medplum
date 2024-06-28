import { parseLogLevel } from '@medplum/core';
import express from 'express';
import gracefulShutdown from 'http-graceful-shutdown';
import { initApp, shutdownApp } from './app';
import { loadConfig } from './config';
import { globalLogger } from './logger';

export async function main(configName: string): Promise<void> {
  process.on('unhandledRejection', (err: any) => {
    globalLogger.error('Unhandled promise rejection', err);
  });

  process.on('uncaughtException', (err) => {
    globalLogger.error('Uncaught exception thrown', err);

    if (err.message && typeof err.message === 'string' && err.message.includes('Connection terminated unexpectedly')) {
      // The pg-pool library throws this error when the database connection is lost.
      // This can happen when the database server is restarted.
      // We do *not* want to exit the process in this case.
      return;
    }

    process.exit(1);
  });

  globalLogger.info('Starting Medplum Server...', { configName });

  const config = await loadConfig(configName);
  if (config.logLevel) {
    globalLogger.level = parseLogLevel(config.logLevel);
  }

  const app = await initApp(express(), config);
  const server = app.listen(config.port);
  server.keepAliveTimeout = config.keepAliveTimeout ?? 90000;
  globalLogger.info('Server started', { port: config.port });
  gracefulShutdown(server, {
    timeout: config.shutdownTimeoutMilliseconds,
    development: process.env.NODE_ENV !== 'production',
    preShutdown: async (signal) => {
      globalLogger.info(
        `Shutdown signal received... allowing graceful shutdown for up to ${config.shutdownTimeoutMilliseconds} milliseconds`,
        { signal }
      );
    },
    onShutdown: () => shutdownApp(),
    finally: () => {
      globalLogger.info('Shutdown complete');
    },
  });
}

if (require.main === module) {
  main(process.argv.length === 3 ? process.argv[2] : 'file:medplum.config.json').catch(console.log);
}
