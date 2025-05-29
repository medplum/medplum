import { Modal, Group, Tooltip, ActionIcon, Flex, Text } from '@mantine/core';
import { DiagnosticReport } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { IconStackForward, IconX } from '@tabler/icons-react';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { useMedplumNavigate } from '@medplum/react-hooks';

export interface DiagnosticReportDialogProps {
  readonly diagnosticReport?: DiagnosticReport;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function DiagnosticReportDialog(props: DiagnosticReportDialogProps): JSX.Element {
  const { diagnosticReport, opened, onClose } = props;
  const navigate = useMedplumNavigate();

  // Compute the resource URL
  let resourceUrl = '';
  if (diagnosticReport?.subject?.reference && diagnosticReport.id) {
    // subject.reference is like 'Patient/123', so split to get the id
    const patientId = diagnosticReport.subject.reference.split('/')[1];
    resourceUrl = `/Patient/${patientId}/DiagnosticReport/${diagnosticReport.id}`;
  }

  const handleXRayClick = (): void => {
    if (resourceUrl) {
      navigate(resourceUrl);
      onClose();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} size="xl" withCloseButton={false}>
      <Flex align="center" justify="space-between" style={{ minHeight: 40, paddingBottom: 8 }}>
        <Text fw={500}>Lab Results</Text>
        <Group gap={12}>
          {resourceUrl && (
            <Tooltip label="X-Ray" withArrow>
              <ActionIcon
                onClick={handleXRayClick}
                variant="subtle"
                color="gray"
                aria-label="Open Diagnostic Report Resource Page"
              >
                <IconStackForward size={22} />
              </ActionIcon>
            </Tooltip>
          )}
          <ActionIcon
            onClick={onClose}
            variant="subtle"
            color="gray"
            aria-label="Close"
          >
            <IconX size={22} />
          </ActionIcon>
        </Group>
      </Flex>
      {diagnosticReport && <DiagnosticReportDisplay value={diagnosticReport} />}
    </Modal>
  );
} 