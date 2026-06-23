// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express from 'express';
import gracefulShutdown from 'http-graceful-shutdown';
import { initApp, shutdownApp } from './app';
import { loadConfig } from './config/loader';
import { exitAfterStdoutDrain, globalLogger } from './logger';
import { getServerVersion } from './util/version';

export async function main(configName: string): Promise<void> {
  process.on('unhandledRejection', (err: any) => {
    globalLogger.error('Unhandled promise rejection', err);
  });

  process.on('uncaughtException', async (err) => {
    globalLogger.error('Uncaught exception thrown', err);

    if (err.message && typeof err.message === 'string' && err.message.includes('Connection terminated unexpectedly')) {
      // The pg-pool library throws this error when the database connection is lost.
      // This can happen when the database server is restarted.
      // We do *not* want to exit the process in this case.
      return;
    }

    if (err.message && typeof err.message === 'string' && err.message.includes('Unexpected end of input')) {
      // Workaround for OpenTelemetry bug: https://github.com/open-telemetry/opentelemetry-js/issues/5095
      // The otel library can throw this error on malformed X-Forwarded-For headers.
      // We do *not* want to exit the process in this case.
      return;
    }

    await exitAfterStdoutDrain();
  });

  globalLogger.info('Starting Medplum Server...', { configName, version: getServerVersion() });

  const config = await loadConfig(configName);

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

export async function runFromCli(argv: string[]): Promise<void> {
  try {
    await main(argv.length === 3 ? argv[2] : 'file:medplum.config.json');
  } catch (err) {
    globalLogger.error('Fatal error during startup', err as Error);
    await exitAfterStdoutDrain();
  }
}

if (import.meta.main) {
  // We should never hit the catch block here but we can't do top-level await due to how we transpile to CJS for Jest
  runFromCli(process.argv).catch(console.error);
}
