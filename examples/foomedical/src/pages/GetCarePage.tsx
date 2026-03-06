// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Schedule } from '@medplum/fhirtypes';
import { Document, Scheduler, useMedplum } from '@medplum/react';
import type { JSX } from 'react';

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const schedule = medplum.searchOne('Schedule').read();

  return (
    <Document width={800}>
      <Scheduler schedule={schedule as Schedule} />
    </Document>
  );
}
