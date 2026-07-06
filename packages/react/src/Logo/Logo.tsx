// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useId } from 'react';

export interface LogoProps {
  readonly size: number;
  readonly fill?: string;
}

export function Logo(props: LogoProps): JSX.Element {
  const overrideUrl = import.meta.env.MEDPLUM_LOGO_URL;
  const maskId = 'msLogo' + useId().replace(/:/g, '');
  if (overrideUrl) {
    return <img src={overrideUrl} alt="Logo" style={{ maxHeight: props.size }} />;
  }
  // MedsScript mark: a diagonal prescription capsule with a medical cross knocked out.
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" style={{ width: props.size, height: props.size }}>
      <title>MedsScript Logo</title>
      <mask id={maskId}>
        <rect x="0" y="0" width="180" height="180" fill="white" />
        <rect x="80" y="50" width="20" height="80" rx="7" fill="black" />
        <rect x="50" y="80" width="80" height="20" rx="7" fill="black" />
      </mask>
      <rect
        x="20"
        y="64"
        width="140"
        height="52"
        rx="26"
        fill={props.fill ?? '#0d9488'}
        transform="rotate(-45 90 90)"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
