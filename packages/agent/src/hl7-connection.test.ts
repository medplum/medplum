// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY, Hl7Message } from '@medplum/core';
import type { AgentChannel, Endpoint } from '@medplum/fhirtypes';
import type { EnhancedMode, Hl7Connection } from '@medplum/hl7';
import type { Mock } from 'vitest';
import type { App } from './app';
import { AgentHl7Channel, AgentHl7ChannelConnection } from './hl7';
import { createMockLogger } from './test-utils';

/**
 * Commit-ACK edge cases for {@link AgentHl7ChannelConnection}.
 *
 * These were ported from `@medplum/hl7`'s connection tests when the commit-ACK
 * logic moved out of the library and into the agent. The durable path keeps
 * `enhancedMode` *off* the {@link Hl7Connection} (so its synchronous auto-ACK
 * never fires) and the agent sends CA/AA/CE/CR/AE/AR itself, after the DB write,
 * via the private `sendCommitAck`/`sendCommitNack` helpers exercised here.
 */
describe('AgentHl7ChannelConnection commit ACK', () => {
  const testMessage = Hl7Message.parse(
    'MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||DFT^P03|MSG_DEF_01|P|2.3\rPID|1||12345^^^MRN^MR||DOE^JOHN^A'
  );

  // The agent calls `connection.send(response)` with an Hl7Message (not a wire
  // buffer), so the sent ACK can be inspected directly off the send mock.
  function ackCodeOf(message: Hl7Message): string | undefined {
    return message.getSegment('MSA')?.getField(1)?.toString();
  }

  function ackTextOf(message: Hl7Message): string | undefined {
    return message.getSegment('MSA')?.getField(3)?.toString();
  }

  /** The private commit-ACK surface under test. */
  interface CommitAckInternals {
    sendCommitAck(message: Hl7Message): void;
    sendCommitNack(message: Hl7Message, code: 'CR' | 'CE' | 'AR' | 'AE', reason?: string): void;
  }

  function createMockHl7Connection(): Hl7Connection {
    const eventListeners = new Map<string, ((...args: any[]) => void)[]>();
    return {
      socket: {
        remoteAddress: '127.0.0.1',
        remotePort: 12345,
      },
      addEventListener: vi.fn((event: string, listener: (...args: any[]) => void) => {
        const listeners = eventListeners.get(event) ?? [];
        listeners.push(listener);
        eventListeners.set(event, listeners);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        for (const listener of eventListeners.get(event.type) ?? EMPTY) {
          listener(event);
        }
      }),
      setEncoding: vi.fn(),
      setEnhancedMode: vi.fn(),
      setMessagesPerMin: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as Hl7Connection;
  }

  function createChannel(enhancedMode: EnhancedMode): AgentHl7Channel {
    const mockApp = {
      log: createMockLogger(),
      channelLog: createMockLogger(),
      heartbeatEmitter: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      },
      getAgentConfig: vi.fn(),
      addToWebSocketQueue: vi.fn(),
      agentId: 'test-agent',
      getDurableQueue: vi.fn().mockReturnValue(undefined),
    } as unknown as App;

    const definition = { name: 'test-channel' } as AgentChannel;
    const endpoint = { resourceType: 'Endpoint', status: 'active', address: 'mllp://0.0.0.0:0' } as Endpoint;
    const channel = new AgentHl7Channel(mockApp, definition, endpoint);
    // The channel tracks its own enhanced mode (the durable path's source of
    // truth, since the connection deliberately has none). Set it directly — the
    // URL parsing that normally populates it is covered by parseEnhancedMode tests.
    (channel as unknown as { enhancedMode: EnhancedMode }).enhancedMode = enhancedMode;
    return channel;
  }

  /**
   * Builds a channel + channel-connection for the given mode and exposes the send
   * mock plus a spy listener registered on the connection's `enhancedAckSent`.
   * @param enhancedMode - The enhanced mode the channel should report.
   * @returns The channel connection (as its private commit-ACK surface), the send mock, and the ack-listener spy.
   */
  function setup(enhancedMode: EnhancedMode): {
    connection: CommitAckInternals;
    send: Mock;
    ackListener: Mock;
  } {
    const channel = createChannel(enhancedMode);
    const mockConnection = createMockHl7Connection();
    const channelConnection = new AgentHl7ChannelConnection(channel, mockConnection);
    const ackListener = vi.fn();
    mockConnection.addEventListener('enhancedAckSent', ackListener);
    return {
      connection: channelConnection as unknown as CommitAckInternals,
      send: (mockConnection as unknown as { send: Mock }).send,
      ackListener,
    };
  }

  test('sendCommitAck sends CA in standard mode and dispatches enhancedAckSent', () => {
    const { connection, send, ackListener } = setup('standard');

    connection.sendCommitAck(testMessage);

    expect(send).toHaveBeenCalledTimes(1);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('CA');
    expect(ackListener).toHaveBeenCalledTimes(1);
  });

  test('sendCommitAck sends AA in aaMode', () => {
    const { connection, send } = setup('aaMode');

    connection.sendCommitAck(testMessage);

    expect(send).toHaveBeenCalledTimes(1);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('AA');
  });

  test('sendCommitAck is a no-op when not in enhanced mode', () => {
    const { connection, send, ackListener } = setup(undefined);

    connection.sendCommitAck(testMessage);

    expect(send).not.toHaveBeenCalled();
    expect(ackListener).not.toHaveBeenCalled();
  });

  test('sendCommitAck re-sends on every call (no idempotency guard — the DB is the dedup authority)', () => {
    // A deliberate retransmit must be re-acked because the sender never saw the
    // original ACK; dedup is the durable queue's job, not the connection's.
    const { connection, send } = setup('standard');

    connection.sendCommitAck(testMessage);
    connection.sendCommitAck(testMessage);

    expect(send).toHaveBeenCalledTimes(2);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('CA');
    expect(ackCodeOf(send.mock.calls[1][0] as Hl7Message)).toBe('CA');
  });

  test('sendCommitNack sends CR in standard mode with the reason in MSA.3', () => {
    const { connection, send, ackListener } = setup('standard');

    connection.sendCommitNack(testMessage, 'CR', 'storage error');

    expect(send).toHaveBeenCalledTimes(1);
    const response = send.mock.calls[0][0] as Hl7Message;
    expect(ackCodeOf(response)).toBe('CR');
    expect(ackTextOf(response)).toBe('storage error');
    expect(ackListener).toHaveBeenCalledTimes(1);
  });

  test('sendCommitNack sends AR in aaMode', () => {
    const { connection, send } = setup('aaMode');

    connection.sendCommitNack(testMessage, 'AR');

    expect(send).toHaveBeenCalledTimes(1);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('AR');
  });

  test('sendCommitNack sends CE (retryable commit error) in standard mode', () => {
    const { connection, send } = setup('standard');

    connection.sendCommitNack(testMessage, 'CE', 'storage error');

    expect(send).toHaveBeenCalledTimes(1);
    const response = send.mock.calls[0][0] as Hl7Message;
    expect(ackCodeOf(response)).toBe('CE');
    expect(ackTextOf(response)).toBe('storage error');
  });

  test('sendCommitNack sends AE (retryable application error) in aaMode', () => {
    const { connection, send } = setup('aaMode');

    connection.sendCommitNack(testMessage, 'AE');

    expect(send).toHaveBeenCalledTimes(1);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('AE');
  });

  test('sendCommitNack is a no-op when not in enhanced mode', () => {
    const { connection, send } = setup(undefined);

    connection.sendCommitNack(testMessage, 'CR');

    expect(send).not.toHaveBeenCalled();
  });

  test('sendCommitAck after a sendCommitNack (CE) for the same MSH.10 still sends', () => {
    // A NACK followed by the eventual successful commit ACK both reach the wire —
    // there is no per-connection guard suppressing the second send.
    const { connection, send } = setup('standard');

    connection.sendCommitNack(testMessage, 'CE', 'storage error');
    connection.sendCommitAck(testMessage);

    expect(send).toHaveBeenCalledTimes(2);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('CE');
    expect(ackCodeOf(send.mock.calls[1][0] as Hl7Message)).toBe('CA');
  });

  test('sendCommitNack (CR) followed by sendCommitAck both reach the wire', () => {
    const { connection, send } = setup('standard');

    connection.sendCommitNack(testMessage, 'CR');
    connection.sendCommitAck(testMessage);

    // No per-connection idempotency guard: both sends go out. Dedup is the
    // durable queue's responsibility, not the connection's.
    expect(send).toHaveBeenCalledTimes(2);
    expect(ackCodeOf(send.mock.calls[0][0] as Hl7Message)).toBe('CR');
    expect(ackCodeOf(send.mock.calls[1][0] as Hl7Message)).toBe('CA');
  });
});

/**
 * In durable mode the agent keeps `enhancedMode` off the connection (so the
 * library's synchronous auto-ACK can't fire), while still tracking the real mode
 * on the channel for its own deferred ACK.
 */
describe('AgentHl7Channel enhanced mode wiring', () => {
  function createChannel(address: string, durableQueueOn: boolean): AgentHl7Channel {
    const mockApp = {
      log: createMockLogger(),
      channelLog: createMockLogger(),
      heartbeatEmitter: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      },
      getAgentConfig: vi.fn(),
      addToWebSocketQueue: vi.fn(),
      agentId: 'test-agent',
      getDurableQueue: vi.fn().mockReturnValue(durableQueueOn ? {} : undefined),
      getChannelRetrySettings: vi.fn().mockReturnValue({}),
      getChannelMaxConcurrentPerQueue: vi.fn().mockReturnValue(undefined),
    } as unknown as App;

    const definition = { name: 'test-channel' } as AgentChannel;
    const endpoint = { resourceType: 'Endpoint', status: 'active', address } as Endpoint;
    return new AgentHl7Channel(mockApp, definition, endpoint);
  }

  function configure(channel: AgentHl7Channel): void {
    (channel as unknown as { configureHl7ServerAndConnections(): void }).configureHl7ServerAndConnections();
  }

  test('legacy mode passes enhancedMode through to the connection (auto-ACK stays on)', () => {
    const channel = createChannel('mllp://0.0.0.0:0?enhanced=true', false);
    configure(channel);

    expect(channel.getEnhancedMode()).toBe('standard');
    // Legacy path: the server (and thus new connections) carries the mode, so the
    // connection auto-ACKs exactly as before.
    expect(channel.server.getEnhancedMode()).toBe('standard');
  });

  test('durable mode keeps enhancedMode off the connection while the channel still tracks it', () => {
    const channel = createChannel('mllp://0.0.0.0:0?enhanced=true', true);
    configure(channel);

    // Channel knows the real mode (drives the agent's deferred CA after the DB write)...
    expect(channel.getEnhancedMode()).toBe('standard');
    // ...but the connection does NOT, so the library's synchronous auto-ACK never fires.
    expect(channel.server.getEnhancedMode()).toBeUndefined();
  });

  test('durable aaMode is tracked on the channel but withheld from the connection', () => {
    const channel = createChannel('mllp://0.0.0.0:0?enhanced=aa', true);
    configure(channel);

    expect(channel.getEnhancedMode()).toBe('aaMode');
    expect(channel.server.getEnhancedMode()).toBeUndefined();
  });
});
