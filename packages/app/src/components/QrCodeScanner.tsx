// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import jsQR from 'jsqr';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface QrCodeScannerProps {
  onScan: (data: string) => void;
}

export function QrCodeScanner({ onScan }: QrCodeScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  // Keep the latest onScan without retriggering the effect / restarting the camera.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const video = videoRef.current;
    const canvasElement = canvasRef.current;
    const ctx = canvasElement?.getContext('2d');
    if (!video || !canvasElement || !ctx) {
      return undefined;
    }

    let rafId = 0;
    let stream: MediaStream | undefined;
    let cancelled = false;

    function tick(): void {
      if (!video || !canvasElement || !ctx || cancelled) {
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        setLoading(false);
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          onScanRef.current(code.data);
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return undefined;
        }
        stream = mediaStream;
        video.srcObject = mediaStream;
        video.setAttribute('playsinline', 'true'); // tell iOS Safari we don't want fullscreen
        return video.play();
      })
      .then(() => {
        if (!cancelled) {
          rafId = requestAnimationFrame(tick);
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div>
      <video ref={videoRef} hidden />
      <canvas ref={canvasRef} hidden={loading} />
      {loading && <div>⌛ Loading video...</div>}
    </div>
  );
}
