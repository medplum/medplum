// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

export interface SmartLogoProps {
  readonly size?: number;
  readonly color?: string;
}

export function SmartLogo({ size = 16, color }: SmartLogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      color={color}
    >
      <path d="M10.5801 4H14.8934L19.9786 12.2836L25.1545 4H29.377L19.9786 19.2617L10.5801 4Z" fill="currentColor" />
      <path
        d="M0 20.0722L2.17935 16.6508H12.3497L7.30992 8.27707L9.39849 4.81055L18.7516 20.0722H0Z"
        fill="currentColor"
      />
      <path
        d="M39.9995 21.4219L37.8656 24.8433H27.6952L32.735 33.3071L30.601 36.7286L21.248 21.4219H39.9995Z"
        fill="currentColor"
      />
      <path
        d="M30.601 4.76562L32.7804 8.27717L27.6498 16.6509H37.911L39.9995 20.0724H21.248L30.601 4.76562Z"
        fill="currentColor"
      />
      <path
        d="M9.39849 36.7286L7.21911 33.2171L12.3497 24.8433H2.08855L0 21.4219H18.7516L9.39849 36.7286Z"
        fill="currentColor"
      />
    </svg>
  );
}
