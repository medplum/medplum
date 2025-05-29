import { Box, Flex, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { DiagnosticReport, Encounter, Patient, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplumNavigate } from '@medplum/react-hooks';
import { JSX, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { DiagnosticReportDialog } from './DiagnosticReportDialog';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface LabsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly serviceRequests: ServiceRequest[];
  readonly diagnosticReports: DiagnosticReport[];
  readonly onClickResource?: (resource: Resource) => void;
}

export function Labs(props: LabsProps): JSX.Element {
  const { serviceRequests, diagnosticReports, patient, onClickResource } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [editServiceRequest, setEditServiceRequest] = useState<ServiceRequest | undefined>();
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | undefined>();
  const [reportDialogOpened, { open: openReportDialog, close: closeReportDialog }] = useDisclosure(false);
  const navigate = useMedplumNavigate();

  // Collect requisition numbers with a completed ServiceRequest
  const completedRequisitionNumbers = new Set(
    serviceRequests
      .filter((req) => req.status === 'completed' && req.requisition?.value)
      .map((req) => req.requisition?.value)
  );

  console.log('Completed requisition numbers:', Array.from(completedRequisitionNumbers));

  // Filter out ServiceRequests with completed, draft, entered-in-error, or completed requisition numbers
  const filteredServiceRequests = serviceRequests
    .filter((request) => {
      const requisitionNumber = request.requisition?.value;
      console.log('Checking request:', {
        id: request.id,
        status: request.status,
        requisitionNumber,
        isCompletedRequisition: requisitionNumber ? completedRequisitionNumbers.has(requisitionNumber) : false,
      });

      if (request.status === 'completed' || request.status === 'draft' || request.status === 'entered-in-error') {
        return false;
      }
      if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
        return false;
      }
      return true;
    })
    .reduce<ServiceRequest[]>((acc, current) => {
      // If this request is based on another request
      if (current.basedOn?.[0]?.reference) {
        const basedOnId = current.basedOn[0].reference.split('/')[1];
        const existingIndex = acc.findIndex((req) => req.id === basedOnId);

        if (existingIndex !== -1) {
          // Replace the older version with the newer one
          acc[existingIndex] = current;
        } else {
          acc.push(current);
        }
      } else {
        // If not based on another request, just add it
        acc.push(current);
      }
      return acc;
    }, []);

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

  const handleServiceRequestClick = (serviceRequest: ServiceRequest): void => {
    if (onClickResource) {
      onClickResource(serviceRequest);
    } else if (patient.id && serviceRequest.id) {
      navigate(`/Patient/${patient.id}/ServiceRequest/${serviceRequest.id}`);
    }
  };

  const handleDiagnosticReportClick = (report: DiagnosticReport): void => {
    setSelectedReport(report);
    openReportDialog();
  };

  return (
    <>
      <CollapsibleSection
        title="Labs"
        onAdd={() => {
          setEditServiceRequest(undefined);
          open();
        }}
      >
        <Flex direction="column" gap={8}>
          {filteredServiceRequests.map((serviceRequest) => (
            <SummaryItem key={serviceRequest.id} onClick={() => handleServiceRequestClick(serviceRequest)}>
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
                  {report.basedOn?.[0]?.display || report.code?.coding?.[0]?.display || 'Diagnostic Report'}
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
      <Modal opened={opened} onClose={close} title={editServiceRequest ? 'Edit Lab Order' : 'Add Lab Order'}>
        {/* TODO: Add ServiceRequestDialog component */}
      </Modal>
      <DiagnosticReportDialog
        diagnosticReport={selectedReport}
        opened={reportDialogOpened}
        onClose={closeReportDialog}
      />
    </>
  );
}
