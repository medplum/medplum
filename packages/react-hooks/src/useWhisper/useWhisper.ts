// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Adapted from https://github.com/codyebberson/medplum-ai-realtime/blob/main/src/hooks/useWhisper.ts
import { ReconnectingWebSocket, sleep } from '@medplum/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

export type WhisperStatus =
  | 'idle'
  | 'requesting_microphone'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speech_started'
  | 'speech_stopped'
  | 'disconnected'
  | 'error';

export type TranscriptItem = {
  text: string;
  timestamp: string;
};

export type UseWhisperOptions = {
  language?: string;
  model?: string;
  onTranscript?: (text: string) => void;
  /**
   * How long to keep the WebSocket warm after stop() before fully closing it, in milliseconds.
   * Defaults to 120000 (2 minutes). Set to 0 or a non-finite value to keep the socket warm
   * until unmount (the previous behavior).
   */
  idleTimeoutMs?: number;
};

// Fully close a warm-but-unused socket after this long; the timer resets whenever capture
// (re)starts so an active or about-to-resume session is never torn down.
const DEFAULT_IDLE_TIMEOUT_MS = 120_000; // 2 minutes

export type UseWhisperResult = {
  status: WhisperStatus;
  error: unknown;
  transcripts: TranscriptItem[];
  start: () => Promise<void>;
  stop: () => void;
  isListening: boolean;
};

export function useWhisper({
  language = 'en',
  model = 'gpt-4o-transcribe',
  onTranscript,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: UseWhisperOptions): UseWhisperResult {
  const medplum = useMedplum();
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [error, setError] = useState<unknown>(undefined);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const websocketRef = useRef<typeof ReconnectingWebSocket | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const audioProcessorRef = useRef<AudioWorkletNode | undefined>(undefined);
  const startingCaptureRef = useRef(false);
  const sessionReadyRef = useRef(false);
  const capturingRef = useRef(false);

  // Stop capturing audio and release the microphone, but leave the WebSocket + OpenAI
  // session warm so the next start() can reuse them. This is the user-facing `stop`.
  const stopCapture = useCallback(() => {
    capturingRef.current = false;

    audioProcessorRef.current?.disconnect();
    audioProcessorRef.current = undefined;

    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = undefined;

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = undefined;

    setStatus(websocketRef.current ? 'idle' : 'disconnected');
  }, []);

  // Fully tear down the connection in addition to stopping capture. Used on unmount.
  const closeConnection = useCallback(() => {
    stopCapture();

    websocketRef.current?.close();
    websocketRef.current = undefined;

    sessionReadyRef.current = false;

    setStatus('disconnected');
  }, [stopCapture]);

  const setupSession = useCallback(() => {
    websocketRef.current?.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
              transcription: {
                model,
                language,
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 200,
              },
              noise_reduction: {
                type: 'near_field',
              },
            },
          },
        },
      })
    );
  }, [language, model]);

  const startAudioCapture = useCallback(async () => {
    if (audioProcessorRef.current || startingCaptureRef.current) {
      return; // already capturing, or a start is already in flight
    }
    if (!audioStreamRef.current || !websocketRef.current) {
      return;
    }

    startingCaptureRef.current = true;
    try {
      const audioContext = new AudioContext({ sampleRate: 24000 });
      // AudioWorklet runs the PCM batching on the dedicated audio thread (the deprecated
      // ScriptProcessorNode ran it on the main thread). The processor module is loaded from a
      // Blob URL so the hook stays self-contained and needs no separately bundled worklet file.
      await audioContext.audioWorklet.addModule(getPcmWorkletUrl());

      // Re-validate after the async module load: capture may have been stopped, or the mic /
      // socket swapped out, while the worklet was loading.
      const audioStream = audioStreamRef.current;
      const websocket = websocketRef.current;
      if (!capturingRef.current || !audioStream || !websocket) {
        await audioContext.close().catch(() => undefined);
        return;
      }

      const source = audioContext.createMediaStreamSource(audioStream);
      const processor = new AudioWorkletNode(audioContext, PCM_WORKLET_NAME);

      processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (websocket.readyState !== WebSocket.OPEN) {
          console.warn('WebSocket is not open. Unable to send audio data.');
          return;
        }

        const pcm16Buffer = convertToPCM16(event.data);
        const base64Audio = btoa(String.fromCharCode(...pcm16Buffer));

        websocket.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio,
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      audioProcessorRef.current = processor;

      setStatus('listening');
    } catch (err) {
      setError(err);
      setStatus('error');
      stopCapture();
    } finally {
      startingCaptureRef.current = false;
    }
  }, [stopCapture]);

  // Capture can only start once the user intends to capture, the session is ready, and the
  // mic is acquired — these now arrive in arbitrary order (parallel start, warm reuse,
  // background reconnect).
  const maybeStartAudioCapture = useCallback(() => {
    if (!capturingRef.current) {
      return; // user is not dictating
    }
    if (!sessionReadyRef.current) {
      return; // session.updated not received yet
    }
    if (!audioStreamRef.current) {
      return; // mic not acquired yet
    }
    if (audioProcessorRef.current) {
      return; // already capturing
    }
    // Discard any stale partial buffer left over from a previous utterance on this session.
    websocketRef.current?.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    // startAudioCapture catches its own errors and never rejects; .catch is belt-and-suspenders.
    startAudioCapture().catch(() => undefined);
  }, [startAudioCapture]);

  const handleMessage = useCallback(
    (message: any) => {
      switch (message.type) {
        case 'session.created':
          setupSession();
          break;

        case 'session.updated':
          sessionReadyRef.current = true;
          maybeStartAudioCapture();
          break;

        case 'input_audio_buffer.speech_started':
          setStatus('speech_started');
          break;

        case 'input_audio_buffer.speech_stopped':
          setStatus('speech_stopped');
          break;

        case 'conversation.item.input_audio_transcription.completed':
        case 'input_audio_transcription.completed':
          if (message.transcript) {
            const item = {
              text: message.transcript,
              timestamp: new Date().toISOString(),
            };

            setTranscripts((prev) => [...prev, item]);
            onTranscriptRef.current?.(message.transcript);
          }
          break;

        case 'ai-realtime:connected':
          console.debug('[useWhisper] upstream connected');
          break;

        case 'ai-realtime:error':
        case 'error':
          console.error('[useWhisper] error event', message);
          setError(message);
          setStatus('error');
          break;

        default:
          console.debug('[useWhisper] unhandled message', message.type, message);
          break;
      }
    },
    [setupSession, maybeStartAudioCapture]
  );

  const acquireMicrophone = useCallback(async (): Promise<MediaStream> => {
    setStatus('requesting_microphone');
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    audioStreamRef.current = audioStream;
    return audioStream;
  }, []);

  const openWebSocket = useCallback((): ReconnectingWebSocket => {
    setStatus('connecting');
    const url = buildWebSocketUrl(medplum.getBaseUrl());
    console.debug('[useWhisper] connecting to', url);
    const websocket = new ReconnectingWebSocket(url);
    websocketRef.current = websocket;

    websocket.onopen = () => {
      sessionReadyRef.current = false;
      if (capturingRef.current) {
        setStatus('connected');
      } else {
        setStatus('idle');
      }
      websocket.send(
        JSON.stringify({
          type: 'ai-realtime:connect',
          accessToken: medplum.getAccessToken(),
        })
      );
    };
    websocket.onmessage = (event) => handleMessage(JSON.parse(event.data));
    websocket.onerror = (err) => {
      // While idle, let ReconnectingWebSocket retry silently rather than surfacing an error.
      if (!capturingRef.current) {
        return;
      }
      setError(err);
      closeConnection();
      setStatus('error');
    };

    websocket.onclose = () => {
      sessionReadyRef.current = false;
      if (!websocketRef.current) {
        return; // intentional closeConnection(); status already set
      }
      setStatus(capturingRef.current ? 'connecting' : 'idle');
    };

    return websocket;
  }, [medplum, handleMessage, closeConnection]);

  // Reuse the warm connection if one already exists; otherwise open a new one.
  const ensureConnected = useCallback((): ReconnectingWebSocket => {
    return websocketRef.current ?? openWebSocket();
  }, [openWebSocket]);

  const start = useCallback(async () => {
    try {
      setError(undefined);
      capturingRef.current = true;
      // Reuse a warm connection if present; otherwise open one. Acquire the mic concurrently
      // so its latency overlaps any handshake.
      ensureConnected();
      const micPromise = acquireMicrophone(); // status -> requesting_microphone
      await micPromise;
      // The session may already be ready (warm reuse) or arrive later via session.updated.
      maybeStartAudioCapture();
    } catch (err) {
      setError(err);
      setStatus('error');
      stopCapture();
    }
  }, [acquireMicrophone, ensureConnected, stopCapture, maybeStartAudioCapture]);

  // Fully close a warm-but-idle socket after idleTimeoutMs. 'idle' with a live socket is exactly
  // the warm-but-unused state (stopCapture and the background-reconnect handlers settle there
  // while not capturing). Any status change away from 'idle' — including start() ->
  // 'requesting_microphone', even on warm reuse — runs the cleanup and cancels the pending close.
  useEffect(() => {
    if (status !== 'idle' || !websocketRef.current || !Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
      return undefined;
    }
    // Use @medplum/core's sleep() as a cancellable timer: aborting its signal on cleanup clears
    // the underlying timeout and rejects, so the close never fires once we leave the idle state.
    const controller = new AbortController();
    sleep(idleTimeoutMs, { signal: controller.signal })
      .then(() => closeConnection())
      .catch(() => undefined); // rejects when aborted on cleanup
    return () => controller.abort();
  }, [status, idleTimeoutMs, closeConnection]);

  useEffect(() => {
    return () => closeConnection();
  }, [closeConnection]);

  return {
    status,
    error,
    transcripts,
    start,
    stop: stopCapture,
    isListening: status === 'listening' || status === 'speech_started' || status === 'speech_stopped',
  };
}

export function convertToPCM16(float32Array: Float32Array): Uint8Array {
  const pcm16Array = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16Array[i] = sample * 0x7fff;
  }

  return new Uint8Array(pcm16Array.buffer);
}

function buildWebSocketUrl(baseUrl: string): string {
  const url = new URL('ws/ai-realtime', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

// Name the processor is registered under inside the AudioWorkletGlobalScope.
const PCM_WORKLET_NAME = 'medplum-pcm-worklet';

// Source for the AudioWorklet processor. It runs on the audio rendering thread and replaces the
// deprecated ScriptProcessorNode. process() receives 128-sample render quanta, so it accumulates
// them into ~4096-sample batches (about 170ms at 24kHz) — matching the old ScriptProcessorNode
// buffer size — before transferring each batch to the main thread, where it is converted to PCM16
// and sent over the WebSocket. Defined as a string and loaded via a Blob URL so the hook ships
// without a separately bundled worklet file.
const PCM_WORKLET_SOURCE = `
class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.length = 0;
    this.targetLength = 4096;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) {
      return true;
    }
    // The render quantum buffer is reused between calls, so copy it.
    this.chunks.push(new Float32Array(channel));
    this.length += channel.length;
    if (this.length >= this.targetLength) {
      const merged = new Float32Array(this.length);
      let offset = 0;
      for (const chunk of this.chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      this.port.postMessage(merged, [merged.buffer]);
      this.chunks = [];
      this.length = 0;
    }
    return true;
  }
}

registerProcessor('${PCM_WORKLET_NAME}', PcmWorkletProcessor);
`;

let pcmWorkletUrl: string | undefined;

// Lazily create (and cache) a Blob URL for the worklet module. addModule() must be called per
// AudioContext, but the URL itself can be reused across contexts.
function getPcmWorkletUrl(): string {
  if (!pcmWorkletUrl) {
    const blob = new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' });
    pcmWorkletUrl = URL.createObjectURL(blob);
  }
  return pcmWorkletUrl;
}
