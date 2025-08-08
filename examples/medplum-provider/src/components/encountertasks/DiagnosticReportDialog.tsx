// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { JSX, useCallback, useState } from 'react';
import { CodeableConceptInput, Form, ResourceInput, useMedplum } from '@medplum/react';
import { Button, Group, Stack } from '@mantine/core';
import { CodeableConcept, DiagnosticReport, Practitioner } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';
import { showErrorNotification } from '../../utils/notifications';

interface DiagnosticReportDialogProps {
  onDiagnosticReportCreated: (diagnosticReport: DiagnosticReport) => void;
}

export default function DiagnosticReportDialog(props: DiagnosticReportDialogProps): JSX.Element {
  const { onDiagnosticReportCreated } = props;
  const medplum = useMedplum();
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>(undefined);
  const [performer, setPerformer] = useState<Practitioner | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!diagnosis) {
      showErrorNotification('Please select a diagnosis');
      return;
    }

    setIsLoading(true);
    const conclusion = diagnosis ? diagnosis.text || diagnosis.coding?.[0]?.display : undefined;
    const conclusionCodes = [...(diagnosis ? [diagnosis] : [])];
    const conclusionCode = conclusionCodes.length > 0 ? conclusionCodes : undefined;

    const diagnosticReport: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [...(diagnosis?.coding || [])] },
      performer: performer ? [{ reference: getReferenceString(performer) }] : undefined,
      conclusion,
      conclusionCode,
      issued: new Date().toISOString(),
    };

    try {
      const response: DiagnosticReport = await medplum.createResource(diagnosticReport);
      onDiagnosticReportCreated(response);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setIsLoading(false);
    }
  }, [medplum, diagnosis, performer, onDiagnosticReportCreated]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <ResourceInput
          name="performer"
          label="Performer"
          resourceType="Practitioner"
          required
          onChange={(performer) => setPerformer(performer as Practitioner)}
        />

        <CodeableConceptInput
          binding="http://hl7.org/fhir/sid/icd-10-cm/vs"
          label="ICD-10 Code"
          name="diagnosis"
          path="Condition.code"
          required
          onChange={(diagnosis) => setDiagnosis(diagnosis)}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="outline">Cancel</Button>
          <Button type="submit" loading={isLoading}>
            Create Diagnostic Report
          </Button>
        </Group>
      </Stack>
    </Form>
  );
}
