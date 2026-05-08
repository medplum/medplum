// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Loader } from '@mantine/core';
import type { DetailedHTMLProps, ImgHTMLAttributes, JSX } from 'react';
import { useState } from 'react';

export interface ScannedImageProps extends DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> {
  readonly maxRetries?: number;
}

export function ScannedImage(props: ScannedImageProps): JSX.Element {
  const { maxRetries = 5, ...rest } = props;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'waiting' | 'failed'>('loading');

  const handleError = (): void => {
    if (attempt >= maxRetries) {
      setStatus('failed');
      return;
    }

    setStatus('waiting');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * 2 ** attempt, 16000);
    setTimeout(() => {
      setAttempt((a) => a + 1);
      setStatus('loading');
    }, delay);
  };

  if (status === 'failed') {
    return <div className="image-placeholder">Image unavailable</div>;
  }

  if (status === 'waiting') {
    return <Loader />;
  }

  return <img onLoad={() => setStatus('loaded')} onError={handleError} {...rest} />;
}
