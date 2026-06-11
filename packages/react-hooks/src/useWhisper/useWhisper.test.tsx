// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import type { RenderHookResult } from '@testing-library/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { WS } from 'vitest-websocket-mock';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import type { UseWhisperResult } from './useWhisper';
import { convertToPCM16, useWhisper } from './useWhisper';

type WhisperHookResult = RenderHookResult<UseWhisperResult, unknown>['result'];

/**
 * start() opens the socket asynchronously; keep act() open until onopen has flushed.
 *
 * @param result - The result of the useWhisper hook.
 * @param wsServer - The WebSocket server.
 */
async function startWhisperAndConnect(result: WhisperHookResult, wsServer: WS): Promise<void> {
  await act(async () => {
    await result.current.start();
    await wsServer.connected;
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function completeRealtimeHandshake(result: WhisperHookResult, wsServer: WS): Promise<void> {
  await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });
  await act(async () => {
    wsServer.send({ type: 'session.created' });
  });
  await expect(wsServer).toReceiveMessage(expect.objectContaining({ type: 'session.update' }));
  await act(async () => {
    wsServer.send({ type: 'session.updated' });
  });
  await waitFor(() => {
    expect(result.current.status).toBe('listening');
  });
}

async function startListening(result: WhisperHookResult, wsServer: WS): Promise<void> {
  await startWhisperAndConnect(result, wsServer);
  await completeRealtimeHandshake(result, wsServer);
}

async function restartListening(result: WhisperHookResult): Promise<void> {
  await act(async () => {
    await result.current.start();
  });
  await waitFor(() => expect(result.current.status).toBe('listening'));
}

async function closeWebSocket(wsServer: WS): Promise<void> {
  await act(async () => {
    wsServer.close();
    await wsServer.closed;
  });
}

describe('useWhisper', () => {
  function mockAudioContext(): {
    processor: {
      port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
  } {
    class MockAudioWorkletNode {
      port = { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
      connect = vi.fn();
      disconnect = vi.fn();
    }
    class MockAudioContext {
      destination = {};
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn() });
      close = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-worklet');
    return { processor: new MockAudioWorkletNode() };
  }

  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    WS.clean();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );

  test('returns initial idle state', () => {
    const { result } = renderHook(() => useWhisper({}), { wrapper });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeUndefined();
    expect(result.current.transcripts).toEqual([]);
    expect(result.current.isListening).toBe(false);
  });

  test('stop() transitions to disconnected', () => {
    const { result } = renderHook(() => useWhisper({}), { wrapper });

    act(() => result.current.stop());

    expect(result.current.status).toBe('disconnected');
    expect(result.current.isListening).toBe(false);
  });

  test('start() records error when microphone access fails', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });
    const mediaError = new Error('Permission denied');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(mediaError) },
    });

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.error).toBe(mediaError);
    });
    expect(result.current.isListening).toBe(false);

    // start() opens the socket before mic acquisition fails; flush any onopen update.
    await act(async () => {
      await wsServer.connected;
    });
  });

  test('records transcript end-to-end', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    mockAudioContext();

    const onTranscript = vi.fn();
    const { result } = renderHook(() => useWhisper({ onTranscript }), { wrapper });

    await startListening(result, wsServer);

    await act(async () => {
      wsServer.send({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello world',
      });
    });

    await waitFor(() => {
      expect(result.current.transcripts).toHaveLength(1);
      expect(result.current.transcripts[0].text).toBe('hello world');
      expect(onTranscript).toHaveBeenCalledWith('hello world');
    });
  });

  test('handles speech_started and speech_stopped messages', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    mockAudioContext();

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await startListening(result, wsServer);

    await act(async () => {
      wsServer.send({ type: 'input_audio_buffer.speech_started' });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('speech_started');
    });
    expect(result.current.isListening).toBe(true);

    await act(async () => {
      wsServer.send({ type: 'input_audio_buffer.speech_stopped' });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('speech_stopped');
    });
    expect(result.current.isListening).toBe(true);
  });

  test('handles ai-realtime:error message from server', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await startWhisperAndConnect(result, wsServer);
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });

    const errorMessage = { type: 'ai-realtime:error', message: 'upstream failed' };
    await act(async () => {
      wsServer.send(errorMessage);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toEqual(errorMessage);
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useWhisper] error event', errorMessage);
  });

  test('reuses the warm connection across stop/start', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    mockAudioContext();

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    // First dictation pays the full handshake.
    await startListening(result, wsServer);

    // Stopping keeps the connection warm and returns to idle (not disconnected).
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');

    // Second dictation reaches listening from the warm session, with no new handshake.
    await restartListening(result);

    expect(wsServer.messages.filter((m: any) => m?.type === 'ai-realtime:connect')).toHaveLength(1);
  });

  test('stop keeps the socket open; unmount closes it', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result, unmount } = renderHook(() => useWhisper({}), { wrapper });

    await startWhisperAndConnect(result, wsServer);
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });

    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      unmount();
      await wsServer.closed; // resolves only once the client closes the socket
    });
  });

  test('closes the warm socket after the idle timeout', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { result } = renderHook(() => useWhisper({ idleTimeoutMs: 50 }), { wrapper });

    await startWhisperAndConnect(result, wsServer);
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });

    // Stopping leaves the socket warm-idle...
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');

    // ...but the idle timeout fully closes it.
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    await act(async () => {
      await wsServer.closed; // resolves only once the client closes the socket
    });
  });

  test('start() within the idle window cancels the pending close', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    mockAudioContext();

    // Long enough that the restart below completes well within the window.
    const { result } = renderHook(() => useWhisper({ idleTimeoutMs: 1000 }), { wrapper });

    await startListening(result, wsServer);

    // Stop -> warm idle, which arms the idle-close timer.
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');

    // Restarting before the timeout cancels the pending close and reuses the warm socket.
    await restartListening(result);

    // The socket was never closed: still active, and only the original handshake ever ran
    // (a fresh socket would have produced a second ai-realtime:connect).
    expect(result.current.status).not.toBe('disconnected');
    expect(wsServer.messages.filter((m: any) => m?.type === 'ai-realtime:connect')).toHaveLength(1);
  });

  test('a background drop while idle does not get stuck in a connecting state', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    mockAudioContext();

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await startListening(result, wsServer);

    // User submits -> connection goes warm-idle.
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');

    // Server drops the idle connection in the background (e.g. OpenAI session expiry).
    await closeWebSocket(wsServer);

    // The mic button must remain usable: status must not be left in a connecting-class state.
    await waitFor(() => {
      expect(['idle', 'disconnected']).toContain(result.current.status);
    });
    expect(result.current.status).not.toBe('connecting');
    expect(result.current.status).not.toBe('connected');
  });

  test('unmount cleans up without throwing', () => {
    const { unmount } = renderHook(() => useWhisper({}), { wrapper });
    expect(() => unmount()).not.toThrow();
  });

  describe('convertToPCM16', () => {
    function toInt16(bytes: Uint8Array): Int16Array {
      return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    }

    test('empty input returns empty output', () => {
      expect(convertToPCM16(new Float32Array(0))).toEqual(new Uint8Array(0));
    });

    test('output byte length is 2x input length', () => {
      expect(convertToPCM16(new Float32Array(8)).byteLength).toBe(16);
    });

    test('zero samples produce zero bytes', () => {
      const result = convertToPCM16(new Float32Array([0, 0, 0]));
      expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    test('maps 1.0 to 0x7fff and -1.0 to -0x7fff', () => {
      const samples = toInt16(convertToPCM16(new Float32Array([1, -1])));
      expect(samples[0]).toBe(0x7fff);
      expect(samples[1]).toBe(-0x7fff);
    });

    test('clamps samples outside [-1, 1]', () => {
      const samples = toInt16(convertToPCM16(new Float32Array([2.5, -2.5])));
      expect(samples[0]).toBe(0x7fff);
      expect(samples[1]).toBe(-0x7fff);
    });

    test('encodes mid-range sample correctly', () => {
      const samples = toInt16(convertToPCM16(new Float32Array([0.5])));
      expect(samples[0]).toBe(Math.trunc(0.5 * 0x7fff));
    });

    test('encodes as little-endian PCM16', () => {
      // 0x7fff in little-endian byte order is [0xff, 0x7f]
      const result = convertToPCM16(new Float32Array([1]));
      expect(result[0]).toBe(0xff);
      expect(result[1]).toBe(0x7f);
    });
  });
});
