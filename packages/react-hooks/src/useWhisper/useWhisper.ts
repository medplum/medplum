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

  const stop = useCallback(() => {
    audioProcessorRef.current?.disconnect();
    audioProcessorRef.current = undefined;

    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = undefined;

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = undefined;

    websocketRef.current?.close();
    websocketRef.current = undefined;

    setStatus('disconnected');
  }, []);

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

  const handleMessage = useCallback(
    (message: any) => {
      switch (message.type) {
        case 'session.created':
          setupSession();
          break;

        case 'session.updated':
          startAudioCapture();
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
    [setupSession, startAudioCapture]
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

    websocket.onopen = () => setStatus('connected');
    websocket.onmessage = (event) => handleMessage(JSON.parse(event.data));
    websocket.onerror = (err) => {
      setError(err);
      setStatus('error');
      stop();
    };
    websocket.onclose = () => setStatus('disconnected');

    websocket.send(
      JSON.stringify({
        type: 'ai-realtime:connect',
        accessToken: medplum.getAccessToken(),
      })
    );
    return websocket;
  }, [medplum, handleMessage, stop]);

  const start = useCallback(async () => {
    try {
      setError(undefined);
      await acquireMicrophone();
      openWebSocket();
    } catch (err) {
      setError(err);
      setStatus('error');
      stop();
    }
  }, [acquireMicrophone, openWebSocket, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    status,
    error,
    transcripts,
    start,
    stop,
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
