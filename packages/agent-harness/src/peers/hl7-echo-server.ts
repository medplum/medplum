// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Server, type EnhancedMode, type Hl7MessageEvent } from '@medplum/hl7';
import type { Hl7SinkNodeSpec } from '../types';

/**
 * Test HL7 "sink" — a TCP server that ACKs every inbound message. Used as the
 * downstream receiver in scenario topologies (e.g. push-bot terminal node).
 */
export class Hl7EchoServer {
  readonly spec: Hl7SinkNodeSpec;
  readonly server: Hl7Server;
  private listening = false;
  private boundPort?: number;
  private messageCount = 0;
  private onMessage?: (controlId: string | undefined, raw: string) => void;

  constructor(spec: Hl7SinkNodeSpec) {
    this.spec = spec;
    this.server = new Hl7Server((connection) => {
      connection.addEventListener('message', async (event: Hl7MessageEvent) => {
        this.messageCount++;
        const controlId = event.message.getSegment('MSH')?.getField(10)?.toString();
        this.onMessage?.(controlId, event.message.toString());
        if (this.spec.ackDelayMs && this.spec.ackDelayMs > 0) {
          await sleep(this.spec.ackDelayMs);
        }
        const ack = event.message.buildAck({ ackCode: this.spec.ackCode ?? 'AA' });
        await connection.send(ack);
      });
    });
  }

  async start(): Promise<number> {
    if (this.listening) {
      return this.boundPort as number;
    }
    const enhancedMode: EnhancedMode = this.spec.enhancedMode ?? 'aaMode';
    this.boundPort = await this.server.start(this.spec.port, undefined, enhancedMode);
    this.listening = true;
    return this.boundPort;
  }

  async stop(): Promise<void> {
    if (!this.listening) {
      return;
    }
    await this.server.stop({ forceDrainTimeoutMs: 1_000 });
    this.listening = false;
  }

  getBoundPort(): number | undefined {
    return this.boundPort;
  }

  getStats(): { received: number } {
    return { received: this.messageCount };
  }

  setOnMessage(fn: (controlId: string | undefined, raw: string) => void): void {
    this.onMessage = fn;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
