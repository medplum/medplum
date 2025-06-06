import { Box, Flex, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, getDisplayString } from '@medplum/core';
import { CodeableConcept, DiagnosticReport, Patient, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { JSX, useState } from 'react';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface LabsProps {
  readonly patient: Patient;
  readonly serviceRequests: ServiceRequest[];
  readonly diagnosticReports: DiagnosticReport[];
  readonly onClickResource?: (resource: Resource) => void;
  readonly onRequestLabs?: () => void;
}

export function Labs(props: LabsProps): JSX.Element {
  const { serviceRequests, diagnosticReports, onClickResource, onRequestLabs } = props;
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | undefined>();
  const [reportDialogOpened, { open: openReportDialog, close: closeReportDialog }] = useDisclosure(false);

  // Get all Diagnostic Reports that are code LAB.
  // Build a set of all Service Requests that are based on these Diagnostic Reports.
  const diagnosticReportsRequests = new Set<string>();
  const filteredDiagnosticReports = diagnosticReports.filter((report) => {
    const flag = isLaboratoryReport(report);
    if (flag && report.basedOn) {
      report.basedOn.forEach((basedOn) => {
        if (basedOn.reference?.startsWith('ServiceRequest/')) {
          const [, id] = basedOn.reference.split('/');
          diagnosticReportsRequests.add(id);
        }
      });
    }
    return flag;
  });

  // Filter out Service Requests that are based on Diagnostic Reports.
  // Filter out multiple service requests with the same requisition number.
  const completedRequisitionNumbers = new Set<string>();
  const filteredServiceRequests = serviceRequests.filter((request) => {
    if (request.id && diagnosticReportsRequests.has(request.id)) {
      return false;
    }

    // If the ServiceRequest is also based on a parent ServiceRequest, skip it.
    if (request.basedOn) {
      const basedOn = request.basedOn.find((basedOn) => {
        if (basedOn.reference?.startsWith('ServiceRequest/')) {
          const [, id] = basedOn.reference.split('/');
          return diagnosticReportsRequests.has(id);
        }
        return false;
      });
      if (basedOn) {
        return false;
      }
    }

    const shouldFilter = shouldFilterRequest(request, completedRequisitionNumbers);
    if (!shouldFilter && request.requisition?.value) {
      completedRequisitionNumbers.add(request.requisition?.value);
    }
    return !shouldFilter;
  });

  const handleDiagnosticReportClick = (report: DiagnosticReport): void => {
    setSelectedReport(report);
    openReportDialog();
  };

  return (
    <>
      <CollapsibleSection title="Labs" onAdd={() => onRequestLabs?.()}>
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

          {filteredDiagnosticReports.map((report) => (
            <SummaryItem key={report.id} onClick={() => handleDiagnosticReportClick(report)}>
              <Box>
                <Text fw={500} className={styles.itemText}>
                  {getDisplayString(report)}
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

          {filteredServiceRequests.length === 0 && filteredDiagnosticReports.length === 0 && <Text>(none)</Text>}
        </Flex>
      </CollapsibleSection>
      <Modal opened={reportDialogOpened} onClose={closeReportDialog} size="80%">
        {selectedReport && <DiagnosticReportDisplay value={selectedReport} hideSubject={true} />}
      </Modal>
    </>
  );
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
      return 'indigo';
    case 'final':
      return 'teal';
    case 'cancelled':
      return 'red';
    default:
      return 'gray';
  }
};

function hasLaboratoryCategory(category: CodeableConcept): boolean {
  if (!category.coding || !Array.isArray(category.coding)) {
    return false;
  }

  for (const coding of category.coding) {
    if (coding.code === 'LAB') {
      return true;
    }
  }

  return false;
}

function isLaboratoryReport(report: DiagnosticReport): boolean {
  if (!report.category || !Array.isArray(report.category)) {
    return false;
  }
  for (const category of report.category) {
    if (hasLaboratoryCategory(category)) {
      return true;
    }
  }

  return false;
}

function shouldFilterRequest(request: ServiceRequest, completedRequisitionNumbers: Set<string>): boolean {
  if (['completed', 'draft', 'entered-in-error'].includes(request.status)) {
    return true;
  }

  const requisitionNumber = request.requisition?.value;
  if (requisitionNumber && completedRequisitionNumbers.has(requisitionNumber)) {
    return true;
  }

  return false;
}
