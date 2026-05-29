// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Adapted from https://github.com/codyebberson/medplum-ai-realtime/blob/main/src/hooks/useWhisper.ts
import { ReconnectingWebSocket } from '@medplum/core';
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
};

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
}: UseWhisperOptions): UseWhisperResult {
  const medplum = useMedplum();
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [error, setError] = useState<unknown>(undefined);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const websocketRef = useRef<ReconnectingWebSocket | undefined>(undefined);
  const audioStreamRef = useRef<MediaStream | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const audioProcessorRef = useRef<ScriptProcessorNode | undefined>(undefined);
  // sessionReadyRef stays true across stop/start so a warm connection can be reused; it is
  // only reset when the socket (re)opens or the connection is fully closed.
  const sessionReadyRef = useRef(false);
  // capturingRef is true between a user start() and stop(); it gates auto-starting capture
  // so a stray session.updated (e.g. from a background reconnect while idle) never reopens
  // the mic on its own.
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

    // Keep the connection warm if it is still open; otherwise report disconnected.
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

  const startAudioCapture = useCallback(() => {
    const audioStream = audioStreamRef.current;
    const websocket = websocketRef.current;

    if (!audioStream || !websocket) {
      return;
    }

    const audioContext = new AudioContext({ sampleRate: 24000 });
    const source = audioContext.createMediaStreamSource(audioStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (websocket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket is not open. Unable to send audio data.');
        return;
      }

      const inputBuffer = event.inputBuffer.getChannelData(0);
      const pcm16Buffer = convertToPCM16(inputBuffer);
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
  }, []);

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
    startAudioCapture();
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
      // Re-authenticate on every (re)open: ReconnectingWebSocket reconnects after a drop
      // (e.g. OpenAI session expiry) but does not replay messages, so the connect handshake
      // must be sent here. A fresh access token is read each time.
      sessionReadyRef.current = false;
      // Only surface connection progress while the user is actively starting capture. A
      // background reconnect while idle must NOT flip the UI into a "connecting" state, or
      // the mic button gets stuck on a disabled spinner that never resolves.
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
    // A transient close is left to ReconnectingWebSocket to recover from (onopen re-runs the
    // handshake). Skip if we intentionally closed (websocketRef already cleared). While idle,
    // stay 'idle' rather than entering a connecting-class state.
    websocket.onclose = () => {
      // The session is gone once the socket drops; require a fresh session.updated (sent
      // after onopen re-handshakes) before capture can start again.
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
