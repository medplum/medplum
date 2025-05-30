import { ActionIcon, Flex, Modal, Text } from '@mantine/core';
import { DiagnosticReport } from '@medplum/fhirtypes';
import { IconX } from '@tabler/icons-react';
import { JSX } from 'react';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';

export interface DiagnosticReportDialogProps {
  readonly diagnosticReport?: DiagnosticReport;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function DiagnosticReportDialog(props: DiagnosticReportDialogProps): JSX.Element {
  const { diagnosticReport, opened, onClose } = props;

  return (
    <Modal opened={opened} onClose={onClose} size="80%" withCloseButton={false}>
      <Flex align="center" justify="space-between" style={{ minHeight: 40, paddingBottom: 8 }}>
        <Text fw={500}>Lab Results</Text>
        <ActionIcon onClick={onClose} variant="subtle" color="gray" aria-label="Close">
          <IconX size={22} />
        </ActionIcon>
      </Flex>
      {diagnosticReport && <DiagnosticReportDisplay value={diagnosticReport} hideSubject={true} />}
    </Modal>
  );
}
