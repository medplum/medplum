#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * HL7 Load Test CLI
 *
 * A load testing tool for HL7 MLLP endpoints that measures throughput and latency.
 *
 * Usage:
 *   npx ts-node src/hl7-load-test.ts --host 127.0.0.1 --port 2575 --messages 1000 --clients 10 --rate 100
 */

import { Hl7Message } from '@medplum/core';
import { Hl7Client, ReturnAckCategory } from '@medplum/hl7';

// CLI argument parsing
interface LoadTestConfig {
  host: string;
  port: number;
  messages: number;
  clients: number;
  rate: number; // messages per second (total across all clients)
  timeout: number; // ms
  encoding: string;
  keepAlive: boolean;
  verbose: boolean;
}

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    host: '127.0.0.1',
    port: 2575,
    messages: 100,
    clients: 1,
    rate: 0, // 0 = unlimited
    timeout: 30000,
    encoding: 'utf-8',
    keepAlive: true,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--host':
      case '-h':
        config.host = nextArg;
        i++;
        break;
      case '--port':
      case '-p':
        config.port = parseInt(nextArg, 10);
        i++;
        break;
      case '--messages':
      case '-m':
        config.messages = parseInt(nextArg, 10);
        i++;
        break;
      case '--clients':
      case '-c':
        config.clients = parseInt(nextArg, 10);
        i++;
        break;
      case '--rate':
      case '-r':
        config.rate = parseFloat(nextArg);
        i++;
        break;
      case '--timeout':
      case '-t':
        config.timeout = parseInt(nextArg, 10);
        i++;
        break;
      case '--encoding':
      case '-e':
        config.encoding = nextArg;
        i++;
        break;
      case '--no-keepalive':
        config.keepAlive = false;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
HL7 Load Test CLI

Usage:
  npx ts-node src/hl7-load-test.ts [options]

Options:
  --host, -h <host>       Target host (default: 127.0.0.1)
  --port, -p <port>       Target port (default: 2575)
  --messages, -m <count>  Total number of messages to send (default: 100)
  --clients, -c <count>   Number of concurrent clients (default: 1)
  --rate, -r <rate>       Target messages per second, 0 = unlimited (default: 0)
  --timeout, -t <ms>      Timeout per message in milliseconds (default: 30000)
  --encoding, -e <enc>    Character encoding (default: utf-8)
  --no-keepalive          Disable TCP keepalive
  --verbose, -v           Enable verbose logging
  --help                  Show this help message

Examples:
  # Send 1000 messages with 10 clients at 100 msg/sec
  npx ts-node src/hl7-load-test.ts -h 127.0.0.1 -p 2575 -m 1000 -c 10 -r 100

  # Send 500 messages as fast as possible with 5 clients
  npx ts-node src/hl7-load-test.ts -m 500 -c 5

  # Test with 30 second timeout and verbose output
  npx ts-node src/hl7-load-test.ts -m 100 -t 30000 -v
`);
}

// Generate a sample HL7 ADT^A01 message
function generateHl7Message(msgId: number, clientId: number): Hl7Message {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
  const controlId = `LOADTEST${clientId.toString().padStart(3, '0')}${msgId.toString().padStart(8, '0')}`;

  const messageText = [
    `MSH|^~\\&|LOADTEST|FACILITY|RECEIVER|DEST|${timestamp}||ADT^A01|${controlId}|P|2.5.1`,
    `EVN|A01|${timestamp}`,
    `PID|1||PAT${msgId.toString().padStart(8, '0')}||Test^Patient^${msgId}||19800101|M|||123 Test St^^Testville^ST^12345||555-555-5555`,
    `PV1|1|I|ICU^101^A|||||||||||||||V${msgId.toString().padStart(8, '0')}`,
  ].join('\r');

  return Hl7Message.parse(messageText);
}

// Statistics tracking
interface Stats {
  sent: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  rttValues: number[];
  errors: string[];
  startTime: number;
}

function createStats(): Stats {
  return {
    sent: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    rttValues: [],
    errors: [],
    startTime: Date.now(),
  };
}

// Real-time throughput tracker
class ThroughputTracker {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private lastSent: number = 0;
  private lastTime: number = Date.now();

  start(stats: Stats, totalMessages: number, intervalMs: number = 1000): void {
    this.lastSent = 0;
    this.lastTime = Date.now();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSinceStart = (now - stats.startTime) / 1000;
      const elapsedSinceLast = (now - this.lastTime) / 1000;
      const sentSinceLast = stats.sent - this.lastSent;

      // Current throughput (last interval)
      const currentThroughput = elapsedSinceLast > 0 ? sentSinceLast / elapsedSinceLast : 0;

      // Overall throughput
      const overallThroughput = elapsedSinceStart > 0 ? stats.sent / elapsedSinceStart : 0;

      // Calculate running average RTT
      const avgRtt =
        stats.rttValues.length > 0 ? stats.rttValues.reduce((a, b) => a + b, 0) / stats.rttValues.length : 0;

      // Progress percentage
      const progress = ((stats.sent / totalMessages) * 100).toFixed(1);

      // Clear line and print progress
      process.stdout.write(
        `\r[${progress}%] Sent: ${stats.sent}/${totalMessages} | ` +
          `Current: ${currentThroughput.toFixed(1)} msg/s | ` +
          `Overall: ${overallThroughput.toFixed(1)} msg/s | ` +
          `Avg RTT: ${avgRtt.toFixed(1)}ms | ` +
          `OK: ${stats.succeeded} Fail: ${stats.failed} Timeout: ${stats.timedOut}   `
      );

      this.lastSent = stats.sent;
      this.lastTime = now;
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      // Clear the progress line
      process.stdout.write('\r' + ' '.repeat(120) + '\r');
    }
  }
}

// Rate limiter using token bucket algorithm
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(ratePerSecond: number) {
    this.maxTokens = Math.max(1, ratePerSecond);
    this.tokens = this.maxTokens;
    this.refillRate = ratePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait until we have a token
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
      await sleep(Math.max(1, waitTime));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single client worker
async function runClient(
  clientId: number,
  config: LoadTestConfig,
  messageQueue: number[],
  stats: Stats,
  rateLimiter: RateLimiter | undefined
): Promise<void> {
  const client = new Hl7Client({
    host: config.host,
    port: config.port,
    encoding: config.encoding,
    keepAlive: config.keepAlive,
    connectTimeout: config.timeout,
  });

  try {
    // Connect once at the start
    await client.connect();

    if (config.verbose) {
      console.log(`[Client ${clientId}] Connected to ${config.host}:${config.port}`);
    }

    while (true) {
      // Get next message ID from the shared queue
      const msgId = messageQueue.shift();
      if (msgId === undefined) {
        break; // No more messages
      }

      // Rate limiting (if enabled)
      if (rateLimiter) {
        await rateLimiter.acquire();
      }

      const message = generateHl7Message(msgId, clientId);
      const startTime = Date.now();

      try {
        stats.sent++;

        // Send and wait for application-level ACK (AA), not just commit ACK (CA)
        const response = await client.sendAndWait(message, {
          returnAck: ReturnAckCategory.APPLICATION,
          timeoutMs: config.timeout,
        });

        const rtt = Date.now() - startTime;
        stats.rttValues.push(rtt);

        const ackCode = response.getSegment('MSA')?.getField(1)?.toString();

        if (ackCode === 'AA' || ackCode === 'CA') {
          stats.succeeded++;
          if (config.verbose) {
            console.log(`[Client ${clientId}] Message ${msgId}: ${ackCode} in ${rtt}ms`);
          }
        } else {
          stats.failed++;
          const errorMsg = `Message ${msgId}: Negative ACK (${ackCode})`;
          stats.errors.push(errorMsg);
          if (config.verbose) {
            console.log(`[Client ${clientId}] ${errorMsg}`);
          }
        }
      } catch (err) {
        const rtt = Date.now() - startTime;
        stats.rttValues.push(rtt);

        const errorMessage = err instanceof Error ? err.message : String(err);

        if (errorMessage.includes('timeout')) {
          stats.timedOut++;
          if (config.verbose) {
            console.log(`[Client ${clientId}] Message ${msgId}: Timeout after ${rtt}ms`);
          }
        } else {
          stats.failed++;
          stats.errors.push(`Message ${msgId}: ${errorMessage}`);
          if (config.verbose) {
            console.log(`[Client ${clientId}] Message ${msgId}: Error - ${errorMessage}`);
          }
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Client ${clientId}] Connection error: ${errorMessage}`);
    stats.errors.push(`Client ${clientId} connection error: ${errorMessage}`);
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
}

// Calculate statistics
function calculateStats(stats: Stats, totalDurationMs: number): void {
  const { sent, succeeded, failed, timedOut, rttValues, errors } = stats;

  console.log('\n' + '='.repeat(60));
  console.log('HL7 LOAD TEST RESULTS');
  console.log('='.repeat(60));

  // Message counts
  console.log('\nMessage Summary:');
  console.log(`  Total Sent:      ${sent}`);
  console.log(`  Succeeded (AA):  ${succeeded} (${((succeeded / sent) * 100).toFixed(1)}%)`);
  console.log(`  Failed:          ${failed} (${((failed / sent) * 100).toFixed(1)}%)`);
  console.log(`  Timed Out:       ${timedOut} (${((timedOut / sent) * 100).toFixed(1)}%)`);

  // Throughput
  const durationSec = totalDurationMs / 1000;
  const messagesPerSecond = sent / durationSec;
  console.log('\nThroughput:');
  console.log(`  Total Duration:  ${durationSec.toFixed(2)}s`);
  console.log(`  Send Rate:       ${messagesPerSecond.toFixed(2)} msg/sec`);

  // RTT statistics
  if (rttValues.length > 0) {
    const sortedRtt = [...rttValues].sort((a, b) => a - b);
    const avgRtt = rttValues.reduce((a, b) => a + b, 0) / rttValues.length;
    const minRtt = sortedRtt[0];
    const maxRtt = sortedRtt[sortedRtt.length - 1];
    const medianRtt = sortedRtt[Math.floor(sortedRtt.length / 2)];
    const p95Rtt = sortedRtt[Math.floor(sortedRtt.length * 0.95)];
    const p99Rtt = sortedRtt[Math.floor(sortedRtt.length * 0.99)];

    console.log('\nRound-Trip Time (to final ACK):');
    console.log(`  Min:             ${minRtt}ms`);
    console.log(`  Max:             ${maxRtt}ms`);
    console.log(`  Average:         ${avgRtt.toFixed(2)}ms`);
    console.log(`  Median:          ${medianRtt}ms`);
    console.log(`  95th Percentile: ${p95Rtt}ms`);
    console.log(`  99th Percentile: ${p99Rtt}ms`);
  }

  // Show first few errors if any
  if (errors.length > 0) {
    console.log('\nErrors (first 10):');
    for (const error of errors.slice(0, 10)) {
      console.log(`  - ${error}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  // Key metrics summary
  console.log('\n' + '-'.repeat(60));
  console.log('KEY METRICS SUMMARY');
  console.log('-'.repeat(60));
  console.log(`  Throughput:      ${messagesPerSecond.toFixed(2)} messages/second`);
  if (rttValues.length > 0) {
    const avgRtt = rttValues.reduce((a, b) => a + b, 0) / rttValues.length;
    console.log(`  Average RTT:     ${avgRtt.toFixed(2)} ms`);
  }
  console.log(`  Success Rate:    ${((succeeded / sent) * 100).toFixed(2)}%`);
  console.log('='.repeat(60));
}

// Main entry point
async function main(): Promise<void> {
  const config = parseArgs();

  console.log('HL7 Load Test Configuration:');
  console.log(`  Host:            ${config.host}`);
  console.log(`  Port:            ${config.port}`);
  console.log(`  Total Messages:  ${config.messages}`);
  console.log(`  Clients:         ${config.clients}`);
  console.log(`  Target Rate:     ${config.rate > 0 ? `${config.rate} msg/sec` : 'unlimited'}`);
  console.log(`  Timeout:         ${config.timeout}ms`);
  console.log(`  Encoding:        ${config.encoding}`);
  console.log(`  Keep-Alive:      ${config.keepAlive}`);
  console.log('');

  // Validate configuration
  if (config.messages <= 0) {
    console.error('Error: --messages must be greater than 0');
    process.exit(1);
  }
  if (config.clients <= 0) {
    console.error('Error: --clients must be greater than 0');
    process.exit(1);
  }
  if (config.port <= 0 || config.port > 65535) {
    console.error('Error: --port must be between 1 and 65535');
    process.exit(1);
  }

  // Create shared message queue (message IDs)
  const messageQueue: number[] = Array.from({ length: config.messages }, (_, i) => i + 1);

  // Create shared stats
  const stats = createStats();

  // Create rate limiter if rate is specified
  const rateLimiter = config.rate > 0 ? new RateLimiter(config.rate) : undefined;

  console.log('Starting load test...\n');
  const startTime = Date.now();
  stats.startTime = startTime;

  // Start real-time throughput tracking
  const throughputTracker = new ThroughputTracker();
  if (!config.verbose) {
    // Only show real-time progress in non-verbose mode to avoid cluttering output
    throughputTracker.start(stats, config.messages);
  }

  // Launch all clients concurrently
  const clientPromises: Promise<void>[] = [];
  for (let i = 0; i < config.clients; i++) {
    clientPromises.push(runClient(i + 1, config, messageQueue, stats, rateLimiter));
  }

  // Wait for all clients to complete
  await Promise.all(clientPromises);

  // Stop real-time tracking
  throughputTracker.stop();

  const totalDurationMs = Date.now() - startTime;

  // Calculate and display statistics
  calculateStats(stats, totalDurationMs);

  // Exit with error code if any messages failed
  if (stats.failed > 0 || stats.timedOut > 0) {
    process.exit(1);
  }
}

// Run the main function
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
