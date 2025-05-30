import { Box, Flex, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { DiagnosticReport, Encounter, Patient, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { JSX, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';
import { DiagnosticReportDialog } from './DiagnosticReportDialog';

export interface LabsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly serviceRequests: ServiceRequest[];
  readonly diagnosticReports: DiagnosticReport[];
  readonly onClickResource?: (resource: Resource) => void;
}

export function Labs(props: LabsProps): JSX.Element {
  const { serviceRequests, diagnosticReports, onClickResource } = props;
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | undefined>();
  const [reportDialogOpened, { open: openReportDialog, close: closeReportDialog }] = useDisclosure(false);

  const completedRequisitionNumbers = new Set(
    serviceRequests
      .filter((req) => req.status === 'completed' && req.requisition?.value)
      .map((req) => req.requisition?.value)
  );

  const filteredServiceRequests = serviceRequests
    .filter((request) => {
      const requisitionNumber = request.requisition?.value;

      if (request.status === 'completed' || request.status === 'draft' || request.status === 'entered-in-error') {
        return false;
      }
      if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
        return false;
      }
      return true;
    })
    .reduce<ServiceRequest[]>((acc, current) => {
      if (current.basedOn?.[0]?.reference) {
        const basedOnId = current.basedOn[0].reference.split('/')[1];
        const existingIndex = acc.findIndex((req) => req.id === basedOnId);
        if (existingIndex !== -1) {
          acc[existingIndex] = current;
        } else {
          acc.push(current);
        }
      } else {
        acc.push(current);
      }
      return acc;
    }, []);

  const handleDiagnosticReportClick = (report: DiagnosticReport): void => {
    setSelectedReport(report);
    openReportDialog();
  };

  return (
    <>
      <CollapsibleSection
        title="Labs"
      >
        <Flex direction="column" gap={8}>
          {filteredServiceRequests.map((serviceRequest) => (
            <SummaryItem key={serviceRequest.id} onClick={() => onClickResource?.(serviceRequest)}>
              <Box>
                <Text fw={500} className={styles.itemText}>
                  {getDisplayString(serviceRequest)}
                </Text>
                <Group mt={2} gap={4}>
                  {serviceRequest.status && (
                    <StatusBadge
                      color={getStatusColor(serviceRequest.status)}
                      variant="light"
                      status={serviceRequest.status}
                    />
                  )}
                  <Text size="xs" fw={500} c="dimmed">
                    {formatDate(serviceRequest.authoredOn)}
                  </Text>
                </Group>
              </Box>
            </SummaryItem>
          ))}

          {diagnosticReports.map((report) => (
            <SummaryItem key={report.id} onClick={() => handleDiagnosticReportClick(report)}>
              <Box>
                <Text fw={500} className={styles.itemText}>
                  {report.basedOn?.[0]?.display ?? report.code?.coding?.[0]?.display ?? 'Diagnostic Report'}
                </Text>
                <Group mt={2} gap={4}>
                  {report.status && (
                    <StatusBadge color={getStatusColor(report.status)} variant="light" status={report.status} />
                  )}
                  <Text size="xs" fw={500} c="dimmed">
                    {formatDate(report.issued)}
                  </Text>
                </Group>
              </Box>
            </SummaryItem>
          ))}
          {filteredServiceRequests.length === 0 && diagnosticReports.length === 0 && <Text>(none)</Text>}
        </Flex>
      </CollapsibleSection>
      <DiagnosticReportDialog
        diagnosticReport={selectedReport}
        opened={reportDialogOpened}
        onClose={closeReportDialog}
      />
    </>
  );
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
      return 'indigo';
    case 'completed':
    case 'final':
      return 'teal';
    case 'cancelled':
      return 'red';
    default:
      return 'gray';
  }
};