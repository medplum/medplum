// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { WS } from 'jest-websocket-mock';
import type { JSX } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { convertToPCM16, useWhisper } from './useWhisper';

describe('useWhisper', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    WS.clean();
    jest.restoreAllMocks();
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
    const mediaError = new Error('Permission denied');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockRejectedValue(mediaError) },
    });

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.error).toBe(mediaError);
    });
    expect(result.current.isListening).toBe(false);
  });

  test('records transcript end-to-end', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: jest.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });

    const processor = {
      onaudioprocess: null as ((event: unknown) => void) | null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const sourceNode = { connect: jest.fn() };
    const audioContext = {
      destination: {},
      createMediaStreamSource: jest.fn().mockReturnValue(sourceNode),
      createScriptProcessor: jest.fn().mockReturnValue(processor),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as any).AudioContext = jest.fn().mockImplementation(() => audioContext);

    const onTranscript = jest.fn();
    const { result } = renderHook(() => useWhisper({ onTranscript }), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    await wsServer.connected;
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });

    act(() => wsServer.send({ type: 'transcription_session.created' }));
    await expect(wsServer).toReceiveMessage(expect.objectContaining({ type: 'transcription_session.update' }));

    act(() => wsServer.send({ type: 'transcription_session.updated' }));

    await waitFor(() => {
      expect(result.current.status).toBe('listening');
      expect(result.current.isListening).toBe(true);
    });

    act(() =>
      wsServer.send({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello world',
      })
    );

    await waitFor(() => {
      expect(result.current.transcripts).toHaveLength(1);
      expect(result.current.transcripts[0].text).toBe('hello world');
      expect(onTranscript).toHaveBeenCalledWith('hello world');
    });
  });

  test('handles speech_started and speech_stopped messages', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });

    const stream = { getTracks: () => [{ stop: jest.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });

    const processor = { onaudioprocess: null, connect: jest.fn(), disconnect: jest.fn() };
    const audioContext = {
      destination: {},
      createMediaStreamSource: jest.fn().mockReturnValue({ connect: jest.fn() }),
      createScriptProcessor: jest.fn().mockReturnValue(processor),
      close: jest.fn().mockResolvedValue(undefined),
    };
    globalThis.AudioContext = jest.fn().mockImplementation(() => audioContext);

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    await wsServer.connected;
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });
    act(() => wsServer.send({ type: 'transcription_session.created' }));
    await expect(wsServer).toReceiveMessage(expect.objectContaining({ type: 'transcription_session.update' }));
    act(() => wsServer.send({ type: 'transcription_session.updated' }));

    await waitFor(() => {
      expect(result.current.status).toBe('listening');
    });

    act(() => wsServer.send({ type: 'input_audio_buffer.speech_started' }));
    await waitFor(() => {
      expect(result.current.status).toBe('speech_started');
    });
    expect(result.current.isListening).toBe(true);

    act(() => wsServer.send({ type: 'input_audio_buffer.speech_stopped' }));
    await waitFor(() => {
      expect(result.current.status).toBe('speech_stopped');
    });
    expect(result.current.isListening).toBe(true);
  });

  test('handles ai-realtime:error message from server', async () => {
    const wsServer = new WS('wss://example.com/ws/ai-realtime', { jsonProtocol: true });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const stream = { getTracks: () => [{ stop: jest.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });

    const { result } = renderHook(() => useWhisper({}), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    await wsServer.connected;
    await expect(wsServer).toReceiveMessage({ type: 'ai-realtime:connect' });

    const errorMessage = { type: 'ai-realtime:error', message: 'upstream failed' };
    act(() => wsServer.send(errorMessage));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toEqual(errorMessage);
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useWhisper] error event', errorMessage);
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
