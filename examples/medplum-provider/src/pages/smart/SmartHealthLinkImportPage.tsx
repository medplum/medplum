// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { SmartHealthLinkImport } from './SmartHealthLinkImport';

export function SmartHealthLinkImportPage(): JSX.Element {
  return (
    <Document>
      <SmartHealthLinkImport variant="page" />
    </Document>
  );
}
