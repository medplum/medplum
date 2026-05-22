// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import { Hl7Client } from '@medplum/hl7';
import type { Hl7SourceNodeSpec } from '../types';

const DEFAULT_TEMPLATE_MESSAGE = [
  'MSH|^~\\&|HARNESS|TEST|RECEIVER|TEST|20260101000000||ADT^A01|{CTRL_ID}|P|2.5.1',
  'EVN|A01|20260101000000',
  'PID|1||000000^^^HARNESS^MR||SMOKE^TEST||19800101|M',
  'PV1|1|I|ER^001^01',
].join('\r');

/**
 * Test HL7 "source" — a TCP client that drives load at a configurable mps.
 *
 * Rate is a token bucket: the tick runs every `tickMs`, releasing
 * `mps * tickMs / 1000` messages. Calling setMps() takes effect on the next
 * tick.
 */
export class Hl7SourceClient {
  readonly spec: Hl7SourceNodeSpec;
  private client?: Hl7Client;
  private targetHost = '127.0.0.1';
  private targetPort?: number;
  private mps: number;
  private tickHandle?: NodeJS.Timeout;
  private tickMs = 100;
  private sent = 0;
  private acked = 0;
  private errors = 0;
  private nextControlId = 1;
  private templateMessage: string;
  private onEvent?: (kind: 'sent' | 'acked' | 'error', detail: Record<string, unknown>) => void;

  constructor(spec: Hl7SourceNodeSpec) {
    this.spec = spec;
    this.mps = spec.mps;
    this.templateMessage = spec.templateMessage ?? DEFAULT_TEMPLATE_MESSAGE;
  }

  setTarget(host: string, port: number): void {
    this.targetHost = host;
    this.targetPort = port;
  }

  setMps(mps: number): void {
    this.mps = Math.max(0, mps);
  }

  setOnEvent(fn: (kind: 'sent' | 'acked' | 'error', detail: Record<string, unknown>) => void): void {
    this.onEvent = fn;
  }

  async start(): Promise<void> {
    if (this.targetPort === undefined) {
      throw new Error(`Hl7SourceClient[${this.spec.id}]: setTarget() must be called before start()`);
    }
    this.client = new Hl7Client({
      host: this.targetHost,
      port: this.targetPort,
      keepAlive: this.spec.keepAlive ?? true,
    });
    await this.client.connect();
    this.tickHandle = setInterval(() => {
      this.tick().catch((err) => {
        this.errors++;
        this.onEvent?.('error', { error: String((err as Error).message ?? err) });
      });
    }, this.tickMs);
  }

  async stop(): Promise<void> {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }
    if (this.client) {
      await this.client.close();
      this.client = undefined;
    }
  }

  getStats(): { sent: number; acked: number; errors: number; mps: number } {
    return { sent: this.sent, acked: this.acked, errors: this.errors, mps: this.mps };
  }

  private async tick(): Promise<void> {
    if (!this.client || this.mps <= 0) {
      return;
    }
    const toSend = Math.max(1, Math.round((this.mps * this.tickMs) / 1000));
    const connection = this.client.connection;
    if (!connection) {
      return;
    }
    for (let i = 0; i < toSend; i++) {
      const controlId = `H${this.spec.id}-${this.nextControlId++}`;
      const text = this.templateMessage.replace('{CTRL_ID}', controlId);
      const msg = Hl7Message.parse(text);
      this.sent++;
      this.onEvent?.('sent', { controlId });
      // Fire-and-track: don't await inside the loop or we cap at 1/tick at low latency.
      void connection
        .sendAndWait(msg, { timeoutMs: 5_000 })
        .then(() => {
          this.acked++;
          this.onEvent?.('acked', { controlId });
        })
        .catch((err: Error) => {
          this.errors++;
          this.onEvent?.('error', { controlId, error: err.message });
        });
    }
  }
}
