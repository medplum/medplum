import { DiagnosticReport, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { StatusBadge, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { IconPlus } from '@tabler/icons-react';
import DiagnosticReportDialog from './DiagnosticReportDialog';

interface TaskServiceRequestProps {
  task: Task;
  saveDiagnosticReport: (diagnosticReport: DiagnosticReport) => void;
}

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const SNOMED_DIAGNOSTIC_REPORT_CODE = '108252007';

export const TaskServiceRequest = (props: TaskServiceRequestProps): JSX.Element => {
  const { task, saveDiagnosticReport } = props;
  const medplum = useMedplum();
  const serviceRequestReference = task.input?.[0]?.valueReference as Reference<ServiceRequest>;
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | undefined>(undefined);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | undefined>(undefined);
  const [procedureModalOpen, setProcedureModalOpen] = useState(false);

  useEffect(() => {
    const fetchServiceRequest = async (): Promise<void> => {
      if (serviceRequestReference) {
        const serviceRequest = await medplum.readReference(serviceRequestReference);
        setServiceRequest(serviceRequest);

        if (task.output?.[0]?.valueReference) {
          const diagnosticReport: DiagnosticReport = await medplum.readReference(
            task.output[0].valueReference as Reference<DiagnosticReport>
          );
          setDiagnosticReport(diagnosticReport);
        }
      }
    };
    fetchServiceRequest().catch(showErrorNotification);
  }, [medplum, serviceRequestReference, task.output]);

  if (!serviceRequest) {
    return <div>Loading...</div>;
  }

  const snomedCodes = serviceRequest.code?.coding?.filter(
    (coding) => coding.system === SNOMED_SYSTEM && coding.code !== SNOMED_DIAGNOSTIC_REPORT_CODE
  );

  const displayText = snomedCodes?.map((code) => code.display).join(', ');
  const codeText = snomedCodes?.map((code) => code.code).join(', ');

  return (
    <>
      <Stack p="md">
        <Stack gap={0}>
          <Title>{displayText ? displayText : getDisplayString(serviceRequest)}</Title>
          {codeText && <Text>SNOMED: {codeText}</Text>}
        </Stack>

        {diagnosticReport && (
          <Stack>
            <Stack key={diagnosticReport.id}>
              <Group>
                <StatusBadge status={diagnosticReport.status} size="sm" />
                {diagnosticReport.issued && <Text>Issued: {diagnosticReport.issued}</Text>}
              </Group>
              <Text>{getDisplayString(diagnosticReport)}</Text>
            </Stack>
          </Stack>
        )}

        {!diagnosticReport &&
          serviceRequest.code?.coding?.some(
            (coding) => coding.system === SNOMED_SYSTEM && coding.code === SNOMED_DIAGNOSTIC_REPORT_CODE
          ) && (
            <Group>
              <Button
                onClick={() => setProcedureModalOpen(true)}
                variant="outline"
                leftSection={<IconPlus size={16} />}
              >
                Add Diagnostic Report
              </Button>
            </Group>
          )}
      </Stack>

      <Modal
        opened={procedureModalOpen}
        onClose={() => setProcedureModalOpen(false)}
        title="Create New Diagnostic Report"
        size="lg"
      >
        <DiagnosticReportDialog
          onDiagnosticReportCreated={(diagnosticReport) => {
            saveDiagnosticReport(diagnosticReport);
            setProcedureModalOpen(false);
          }}
        />
      </Modal>
    </>
  );
};
