// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { MEDPLUM_LOGO_COLOR, MEDPLUM_LOGO_PATH } from './Logo.utils';

export interface LogoProps {
  readonly size: number;
  readonly fill?: string;
}

export function Logo(props: LogoProps): JSX.Element {
  const overrideUrl = import.meta.env.MEDPLUM_LOGO_URL;
  if (overrideUrl) {
    return <img src={overrideUrl} alt="Logo" style={{ maxHeight: props.size }} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" style={{ width: props.size, height: props.size }}>
      <title>Medplum Logo</title>
      <path fill={props.fill ?? MEDPLUM_LOGO_COLOR} d={MEDPLUM_LOGO_PATH} />
    </svg>
  );
}
