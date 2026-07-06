// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader, Stack, Text } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

const SCAN_INTERVAL_MS = 150;

type JsQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
) => { data: string } | null;

let jsQrPromise: Promise<JsQr> | undefined;

export interface QrCodeScannerProps {
  readonly onScan: (data: string) => void;
  readonly onError?: (error: Error) => void;
  readonly scanOnce?: boolean;
}

export function QrCodeScanner({ onScan, onError, scanOnce = true }: QrCodeScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const video = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext('2d', { willReadFrequently: true });
    if (!video || !canvasElement || !ctx) {
      return undefined;
    }
    const videoElement = video;
    const scanCanvas = canvasElement;
    const scanCtx = ctx;

    let rafId = 0;
    let stream: MediaStream | undefined;
    let cancelled = false;
    let scanned = false;
    let lastScanTime = 0;
    let jsQr: JsQr | undefined;

    function stopStream(): void {
      stream?.getTracks().forEach((t) => t.stop());
    }

    function fail(err: unknown): void {
      const normalized = err instanceof Error ? err : new Error(String(err));
      if (!cancelled) {
        setLoading(false);
        setError(normalizeErrorString(normalized));
        onErrorRef.current?.(normalized);
      }
    }

    function tick(timestamp: number): void {
      if (cancelled || scanned || !jsQr) {
        return;
      }
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        setLoading(false);
        if (timestamp - lastScanTime >= SCAN_INTERVAL_MS) {
          lastScanTime = timestamp;
          scanCanvas.height = videoElement.videoHeight;
          scanCanvas.width = videoElement.videoWidth;
          scanCtx.drawImage(videoElement, 0, 0, scanCanvas.width, scanCanvas.height);
          const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
          const code = jsQr(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          if (code?.data) {
            scanned = scanOnce;
            onScanRef.current(code.data);
            if (scanOnce) {
              stopStream();
              return;
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    async function start(): Promise<void> {
      try {
        jsQr = await loadJsQr();
        if (cancelled) {
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser.');
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = mediaStream;
        videoElement.srcObject = mediaStream;
        videoElement.setAttribute('playsinline', 'true');
        await videoElement.play();
        if (!cancelled) {
          rafId = requestAnimationFrame(tick);
        }
      } catch (err) {
        fail(err);
      }
    }

    start().catch(fail);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stopStream();
    };
  }, [scanOnce]);

  return (
    <Stack gap="sm">
      {error && <Alert color="red">{error}</Alert>}
      <video
        ref={videoRef}
        width={640}
        height={480}
        muted
        style={{
          aspectRatio: '4 / 3',
          display: error ? 'none' : 'block',
          width: '100%',
          height: 'auto',
          maxHeight: '70vh',
          background: 'black',
        }}
      />
      <canvas ref={canvasRef} hidden />
      {loading && !error && (
        <Text c="dimmed" size="sm">
          <Loader size="xs" mr="xs" />
          Loading camera...
        </Text>
      )}
    </Stack>
  );
}

async function loadJsQr(): Promise<JsQr> {
  if (!jsQrPromise) {
    jsQrPromise = import('jsqr')
      .then((module) => module.default as JsQr)
      .catch((err) => {
        jsQrPromise = undefined;
        throw new Error(
          `QR code scanning requires the optional "jsqr" dependency. Install jsqr to use QrCodeScanner. ${normalizeErrorString(
            err
          )}`
        );
      });
  }
  return jsQrPromise;
}
