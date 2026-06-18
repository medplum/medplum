// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Loader } from '@mantine/core';
import type { DetailedHTMLProps, ImgHTMLAttributes, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface ScannedImageProps extends DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> {
  readonly maxRetries?: number;
}

export function ScannedImage(props: ScannedImageProps): JSX.Element {
  const { maxRetries = 5, ...rest } = props;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'fetching' | 'backoff' | 'loaded' | 'failed'>('fetching');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleError = (): void => {
    if (attempt >= maxRetries) {
      setStatus('failed');
      return;
    }

    setStatus('backoff');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * 2 ** attempt, 16000);
    timeoutRef.current = setTimeout(() => {
      setAttempt((a) => a + 1);
      setStatus('fetching');
      timeoutRef.current = undefined;
    }, delay);
  };

  if (status === 'failed') {
    return <div className="image-placeholder">Image unavailable</div>;
  }

  if (status === 'backoff') {
    return <Loader />;
  }

  return <img onLoad={() => setStatus('loaded')} onError={handleError} {...rest} />;
}
