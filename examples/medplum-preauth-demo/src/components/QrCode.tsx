// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Image } from '@mantine/core';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';

export interface QrCodeProps {
  readonly value: string;
  /** Rendered size in pixels. The image itself is generated at twice this size to stay sharp. */
  readonly size?: number;
}

export function QrCode({ value, size = 240 }: QrCodeProps): JSX.Element | null {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'L' })
      .then(setSrc)
      .catch(console.error);
  }, [value, size]);

  return src ? <Image src={src} w={size} h={size} alt="QR code for the magic link" /> : null;
}
