// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { DiagnosticReport } from '@medplum/fhirtypes';
import { DiagnosticReportDisplay, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';
import { InfoSection } from '../../components/InfoSection';

export function LabResult(): JSX.Element {
  const medplum = useMedplum();
  const { resultId = '' } = useParams();
  const resource: DiagnosticReport = medplum.readResource('DiagnosticReport', resultId).read();

  return (
    <Box p="xl">
      <InfoSection>
        <DiagnosticReportDisplay value={resource} />
      </InfoSection>
    </Box>
  );
}
