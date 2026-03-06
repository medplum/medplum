// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import { Document, Scheduler } from '@medplum/react';
import { useSearchOne } from '@medplum/react-hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export function GetCare(): JSX.Element {
  const [schedule, loading] = useSearchOne('Schedule');

  if (loading) {
    return (
      <Document width={800}>
        <Loader />
      </Document>
    );
  }

  if (!schedule) {
    return (
      <Document width={800}>
        <Alert variant="outline" color="red" title="Schedule unavailable" icon={<IconInfoCircle />}>
          Loading the schedule failed.
        </Alert>
      </Document>
    );
  }

  return (
    <Document width={800}>
      <Scheduler schedule={schedule} />
    </Document>
  );
}
