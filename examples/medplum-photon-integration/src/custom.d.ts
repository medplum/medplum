// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import 'react';

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'photon-client': unknown;
      'photon-prescribe-workflow': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
