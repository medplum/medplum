// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhisperStatus } from '../useWhisper/useWhisper';
import { useWhisper } from '../useWhisper/useWhisper';

export interface UseDictationOptions {
  /**
   * Read the input's current text. Snapshotted when dictation starts (to restore on cancel)
   * and used as the base each transcript chunk is appended to.
   */
  getValue: () => string;
  /** Write text back to the input (the appended transcript, or the snapshot on cancel). */
  setValue: (value: string) => void;
  /** Refocus the input after dictation stops. */
  focusInput?: () => void;
  /** Transcription model passed to {@link useWhisper}. Defaults to `gpt-4o-transcribe`. */
  model?: string;
  /** Surface an error when starting capture fails. */
  onError?: (err: unknown) => void;
  /** Fired after each transcript chunk is appended, with the resulting full value. */
  onAppend?: (value: string) => void;
}

export interface UseDictationResult {
  /** True while a dictation session started via `startDictation` is active. */
  dictating: boolean;
  /** True once the mic is live and capturing (listening / speech started / speech stopped). */
  isRecording: boolean;
  /**
   * Live partial transcript of the in-progress utterance, streamed in before it finalizes and is
   * appended via `setValue`. Empty between utterances and once capture stops. Use it to render a
   * preview of what the speaker is saying ahead of the committed text.
   */
  interim: string;
  status: WhisperStatus;
  muted: boolean;
  setMuted: (value: boolean) => void;
  /** Snapshot the current value and begin dictating. */
  startDictation: () => void;
  /** Stop and restore the value captured when dictation started. */
  cancelDictation: () => void;
  /** Stop and keep the dictated text. */
  acceptDictation: () => void;
  /**
   * Low-level capture controls for building custom modes on top of dictation (e.g. a hands-free
   * voice mode that auto-sends). These do not toggle `dictating` or snapshot the value.
   */
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Shared chat dictation behavior: wraps {@link useWhisper} to append transcribed speech into a
 * text input, snapshotting the pre-dictation value so it can be restored on cancel. Works with
 * both controlled inputs (via `getValue`/`setValue` over state) and uncontrolled ones (via the
 * native value setter).
 *
 * @param options - The dictation options.
 * @returns The dictation controls and state.
 */
export function useDictation(options: UseDictationOptions): UseDictationResult {
  const { model = 'gpt-4o-transcribe' } = options;

  // Keep the latest callbacks in a ref so the returned functions stay stable and the transcript
  // handler always reads current values without re-subscribing useWhisper or forcing callers to memoize.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [dictating, setDictating] = useState(false);
  // Live partial transcript for the current utterance, before it finalizes into the value
  const [interim, setInterim] = useState('');
  // Value captured when dictation started, restored on cancel
  const preDictationValueRef = useRef('');

  const { start, stop, status, muted, setMuted, isListening } = useWhisper({
    model,
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const previous = optionsRef.current.getValue().trim();
      const next = previous ? `${previous} ${trimmed}` : trimmed;
      optionsRef.current.setValue(next);
      optionsRef.current.onAppend?.(next);
    },
    onInterimTranscript: setInterim,
  });

  // Drop any lingering preview once capture stops (stop/cancel/accept all settle here).
  useEffect(() => {
    if (!isListening) {
      setInterim('');
    }
  }, [isListening]);

  const startDictation = useCallback(() => {
    preDictationValueRef.current = optionsRef.current.getValue();
    setDictating(true);
    start().catch((err) => {
      setDictating(false);
      optionsRef.current.onError?.(err);
    });
  }, [start]);

  const exitDictationUi = useCallback(() => {
    // Defer leaving dictation mode until after the current pointer/click event finishes.
    // Otherwise Accept is replaced by Send (type="submit") mid-click and the release can submit the form.
    setTimeout(() => {
      setDictating(false);
      optionsRef.current.focusInput?.();
    }, 0);
  }, []);

  const cancelDictation = useCallback(() => {
    stop();
    optionsRef.current.setValue(preDictationValueRef.current);
    exitDictationUi();
  }, [stop, exitDictationUi]);

  const acceptDictation = useCallback(() => {
    stop();
    exitDictationUi();
  }, [stop, exitDictationUi]);

  return {
    dictating,
    isRecording: isListening,
    interim,
    status,
    muted,
    setMuted,
    startDictation,
    cancelDictation,
    acceptDictation,
    start,
    stop,
  };
}
