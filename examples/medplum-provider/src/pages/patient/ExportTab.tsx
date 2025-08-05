// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Document, PatientExportForm } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function ExportTab(): JSX.Element | null {
  const { patientId } = useParams();
  return (
    <Document maw={600}>
      <PatientExportForm patient={{ reference: `Patient/${patientId}` }} />
    </Document>
  );
}
