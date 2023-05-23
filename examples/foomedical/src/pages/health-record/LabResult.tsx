import { Box } from '@mantine/core';
import { DiagnosticReport } from '@medplum/fhirtypes';
import { DiagnosticReportDisplay, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function LabResult(): JSX.Element {
  const medplum = useMedplum();
  const { resultId = '' } = useParams();
  const resource: DiagnosticReport = medplum.readResource('DiagnosticReport', resultId).read();

  return (
    <Box p="xl">
      <DiagnosticReportDisplay value={resource} />
    </Box>
  );
}
