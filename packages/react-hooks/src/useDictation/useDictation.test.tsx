// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react';
import type { UseWhisperOptions, UseWhisperResult, WhisperStatus } from '../useWhisper/useWhisper';
import { useWhisper } from '../useWhisper/useWhisper';
import { useDictation } from './useDictation';

vi.mock('../useWhisper/useWhisper', () => ({
  useWhisper: vi.fn(),
}));

const mockedUseWhisper = vi.mocked(useWhisper);

/**
 * Controls the mocked useWhisper so tests can drive transcripts and capture state.
 */
let lastOnTranscript: ((text: string) => void) | undefined;
let lastOnInterimTranscript: ((text: string) => void) | undefined;
let lastModel: string | undefined;
let startMock: ReturnType<typeof vi.fn>;
let stopMock: ReturnType<typeof vi.fn>;
let setMutedMock: ReturnType<typeof vi.fn>;
let whisperState: { status: WhisperStatus; muted: boolean; isListening: boolean };

function applyWhisperMock(): void {
  mockedUseWhisper.mockImplementation((options: UseWhisperOptions): UseWhisperResult => {
    lastOnTranscript = options.onTranscript;
    lastOnInterimTranscript = options.onInterimTranscript;
    lastModel = options.model;
    return {
      status: whisperState.status,
      error: undefined,
      transcripts: [],
      start: startMock as unknown as () => Promise<void>,
      stop: stopMock as unknown as () => void,
      isListening: whisperState.isListening,
      muted: whisperState.muted,
      setMuted: setMutedMock as unknown as (value: boolean) => void,
    };
  });
}

beforeEach(() => {
  lastOnTranscript = undefined;
  lastOnInterimTranscript = undefined;
  lastModel = undefined;
  startMock = vi.fn().mockResolvedValue(undefined);
  stopMock = vi.fn();
  setMutedMock = vi.fn();
  whisperState = { status: 'idle', muted: false, isListening: false };
  applyWhisperMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Renders useDictation against a mutable string value, mimicking a controlled input.
 *
 * @param initial - The initial input value.
 * @param extra - Extra useDictation options.
 * @param extra.onError - Error callback invoked when start fails.
 * @param extra.onAppend - Called after each transcript chunk is appended.
 * @param extra.model - Whisper model passed through.
 * @returns The hook result plus a `ref` exposing the current value and focus calls.
 */
function setup(
  initial = '',
  extra: { onError?: (err: unknown) => void; onAppend?: (value: string) => void; model?: string } = {}
): {
  result: { current: ReturnType<typeof useDictation> };
  ref: { value: string; focusCount: number };
  rerender: () => void;
} {
  const ref = { value: initial, focusCount: 0 };
  const { result, rerender } = renderHook(() =>
    useDictation({
      getValue: () => ref.value,
      setValue: (value) => {
        ref.value = value;
      },
      focusInput: () => {
        ref.focusCount += 1;
      },
      ...extra,
    })
  );
  return { result, ref, rerender };
}

describe('useDictation', () => {
  test('startDictation snapshots value, sets dictating, starts whisper', () => {
    const { result } = setup('hello');
    expect(result.current.dictating).toBe(false);
    act(() => result.current.startDictation());
    expect(result.current.dictating).toBe(true);
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  test('passes default model to useWhisper', () => {
    setup('');
    expect(lastModel).toBe('gpt-4o-transcribe');
  });

  test('appends transcripts to the existing value with a space', () => {
    const onAppend = vi.fn();
    const { result, ref } = setup('hello', { onAppend });
    act(() => result.current.startDictation());
    act(() => lastOnTranscript?.('world'));
    expect(ref.value).toBe('hello world');
    expect(onAppend).toHaveBeenCalledWith('hello world');
    act(() => lastOnTranscript?.('again'));
    expect(ref.value).toBe('hello world again');
  });

  test('uses the transcript alone when the input was empty', () => {
    const { result, ref } = setup('');
    act(() => result.current.startDictation());
    act(() => lastOnTranscript?.('  fresh start  '));
    expect(ref.value).toBe('fresh start');
  });

  test('ignores empty/whitespace-only transcripts', () => {
    const onAppend = vi.fn();
    const { result, ref } = setup('keep', { onAppend });
    act(() => result.current.startDictation());
    act(() => lastOnTranscript?.('   '));
    expect(ref.value).toBe('keep');
    expect(onAppend).not.toHaveBeenCalled();
  });

  test('cancelDictation restores the pre-dictation value and stops', async () => {
    const { result, ref } = setup('original');
    act(() => result.current.startDictation());
    act(() => lastOnTranscript?.('dictated text'));
    expect(ref.value).toBe('original dictated text');
    act(() => result.current.cancelDictation());
    expect(ref.value).toBe('original');
    expect(stopMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(result.current.dictating).toBe(false);
    expect(ref.focusCount).toBe(1);
  });

  test('acceptDictation keeps the dictated value and stops', async () => {
    const { result, ref } = setup('original');
    act(() => result.current.startDictation());
    act(() => lastOnTranscript?.('dictated text'));
    act(() => result.current.acceptDictation());
    expect(ref.value).toBe('original dictated text');
    expect(stopMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(result.current.dictating).toBe(false);
    expect(ref.focusCount).toBe(1);
  });

  test('resets dictating and reports error when start fails', async () => {
    const onError = vi.fn();
    const error = new Error('microphone denied');
    startMock.mockRejectedValueOnce(error);
    const { result } = setup('', { onError });
    await act(async () => {
      result.current.startDictation();
      await Promise.resolve();
    });
    expect(result.current.dictating).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });

  test('exposes recording state and mute controls from useWhisper', () => {
    whisperState = { status: 'listening', muted: true, isListening: true };
    applyWhisperMock();
    const { result } = setup('');
    expect(result.current.isRecording).toBe(true);
    expect(result.current.status).toBe('listening');
    expect(result.current.muted).toBe(true);
    act(() => result.current.setMuted(false));
    expect(setMutedMock).toHaveBeenCalledWith(false);
  });

  test('exposes the streamed interim transcript and clears it when capture stops', () => {
    whisperState = { status: 'listening', muted: false, isListening: true };
    applyWhisperMock();
    const { result, rerender } = setup('');
    expect(result.current.interim).toBe('');

    act(() => lastOnInterimTranscript?.('hello wor'));
    expect(result.current.interim).toBe('hello wor');

    // Capture stops -> the live preview is dropped
    whisperState = { status: 'idle', muted: false, isListening: false };
    applyWhisperMock();
    rerender();
    expect(result.current.interim).toBe('');
  });

  test('low-level start/stop are the whisper controls (no dictating toggle)', () => {
    const { result } = setup('');
    act(() => {
      result.current.start().catch(() => undefined);
    });
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(result.current.dictating).toBe(false);
    act(() => result.current.stop());
    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});
