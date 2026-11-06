// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type {
  CarePlan,
  DiagnosticReport,
  DocumentReference,
  MedicationRequest,
  QuestionnaireResponse,
  Reference,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { renderMedplumLink, useDiagnosticReportResources } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { fetchLabOrderRequisitionDocuments, getHealthGorillaRequisitionId } from './documentReference';
import { getQuestionnaireResponseRef } from './labOrder';
import { LabOrderDetailsView } from './LabOrderDetailsView';
import { useLabReportAttachments } from './LabReportContent';

export interface LabOrderDetailsProps {
  order: ServiceRequest;
  onChange?: (order: WithId<ServiceRequest>) => void;
  onResume?: () => void;
  selectedReport?: Reference<DiagnosticReport>;
}

/**
 * The details of a lab order, resolving its report, documents, and people through the Medplum
 * client, revoking through it, and linking with MedplumLink.
 * @param props - The order, the selected report, and the change callbacks.
 * @returns The order details.
 */
export function LabOrderDetails(props: LabOrderDetailsProps): JSX.Element {
  const { order, onChange, onResume, selectedReport } = props;
  const medplum = useMedplum();
  const subject = useResource(order.subject);
  const requester = useResource(order.requester);
  const selectedReportResource = useResource(selectedReport);
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([]);
  const [reportsFetched, setReportsFetched] = useState(false);
  const [labOrderRequisitionDocs, setLabOrderRequisitionDocs] = useState<DocumentReference[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [specimenLabelDocs, setSpecimenLabelDocs] = useState<DocumentReference[]>([]);
  const [loadingSpecimenDocs, setLoadingSpecimenDocs] = useState(false);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse>();

  const handleRevoke = useCallback(async (): Promise<void> => {
    try {
      const updated = await medplum.patchResource('ServiceRequest', order.id as string, [
        { op: 'replace', path: '/status', value: 'revoked' },
      ]);
      onChange?.(updated);
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }, [medplum, order.id, onChange]);

  // An order can have more than one DiagnosticReport (e.g. a multi-day culture result resent
  // with additional findings). When the caller didn't pass a specific selectedReport, fetch just
  // the most recently updated one to show by default.
  useEffect(() => {
    if (selectedReport) {
      return;
    }

    const fetchReports = async (): Promise<void> => {
      const reports = await medplum.searchResources('DiagnosticReport', {
        'based-on': `ServiceRequest/${order.id}`,
        _sort: '-_lastUpdated',
        _count: '1',
      });
      setDiagnosticReports(reports);
      setReportsFetched(true);
    };

    fetchReports().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, order.id, selectedReport]);

  // Fetch Lab Order Requisition documents when order changes
  useEffect(() => {
    const fetchDocuments = async (): Promise<void> => {
      if (!order.id) {
        setLabOrderRequisitionDocs([]);
        return;
      }
      setLoadingDocs(true);
      setLabOrderRequisitionDocs([]); // Clear previous documents immediately

      try {
        const docs = await fetchLabOrderRequisitionDocuments(medplum, order);
        setLabOrderRequisitionDocs(docs);
      } catch (error) {
        console.error('Error fetching lab order requisition documents:', error);
        setLabOrderRequisitionDocs([]);
      } finally {
        setLoadingDocs(false);
      }
    };

    fetchDocuments().catch(console.error);

    // Cleanup function to clear documents when component unmounts or order changes
    return () => {
      setLabOrderRequisitionDocs([]);
      setLoadingDocs(false);
    };
  }, [medplum, order]);

  // Fetch Specimen Label documents when order changes
  useEffect(() => {
    const fetchSpecimenLabelDocuments = async (): Promise<void> => {
      if (!order.id) {
        setSpecimenLabelDocs([]);
        return;
      }
      setLoadingSpecimenDocs(true);
      setSpecimenLabelDocs([]); // Clear previous documents immediately

      try {
        // Extract Health Gorilla Requisition ID from ServiceRequest (same as requisition docs)
        const healthGorillaRequisitionId = getHealthGorillaRequisitionId(order);

        if (!healthGorillaRequisitionId) {
          setSpecimenLabelDocs([]);
          return;
        }

        // Search for DocumentReference with category "SpecimenLabel" using the same identifier pattern
        const searchParams = new URLSearchParams({
          category: 'SpecimenLabel',
          identifier: `https://www.healthgorilla.com|${healthGorillaRequisitionId}`,
          _sort: '-_lastUpdated',
        });

        const searchResult = await medplum.searchResources('DocumentReference', searchParams, { cache: 'no-cache' });
        setSpecimenLabelDocs(searchResult);
      } catch (error) {
        console.error('Error fetching specimen label documents:', error);
        setSpecimenLabelDocs([]);
      } finally {
        setLoadingSpecimenDocs(false);
      }
    };

    fetchSpecimenLabelDocuments().catch(console.error);

    // Cleanup function to clear documents when component unmounts or order changes
    return () => {
      setSpecimenLabelDocs([]);
      setLoadingSpecimenDocs(false);
    };
  }, [medplum, order]);

  // Fetch QuestionnaireResponse when order changes
  useEffect(() => {
    const fetchQuestionnaireResponse = async (): Promise<void> => {
      setQuestionnaireResponse(undefined);

      // First, check if current order has QuestionnaireResponse in supportingInfo
      const currentRef = getQuestionnaireResponseRef(order);
      if (currentRef?.reference) {
        try {
          setQuestionnaireResponse(await medplum.readReference(currentRef as Reference<QuestionnaireResponse>));
          return;
        } catch (error) {
          console.error('Error fetching questionnaire response from current order:', error);
        }
      }

      // For HealthGorilla case: if no QuestionnaireResponse found in current order,
      // search for the original ServiceRequest that has this ServiceRequest in its basedOn field
      // This applies to both open and completed orders
      if (order.id) {
        try {
          // Search for ServiceRequests for the same patient with the same code to narrow down results
          const searchResult = await medplum.searchResources('ServiceRequest', {
            subject: order.subject?.reference,
            code: order.code?.coding?.[0]?.code, // Include the same code to narrow down results
            _count: 50, // Get more results to filter through
          });

          // Prefer the ServiceRequest that has this order in its basedOn field and a QuestionnaireResponse;
          // otherwise fall back to any ServiceRequest with a QuestionnaireResponse
          const withQuestionnaire = searchResult.filter((sr) => getQuestionnaireResponseRef(sr));
          const sourceOrder =
            withQuestionnaire.find((sr) =>
              sr.basedOn?.some(
                (ref: Reference<CarePlan | ServiceRequest | MedicationRequest>) =>
                  ref.reference === `ServiceRequest/${order.id}`
              )
            ) ?? withQuestionnaire[0];
          const sourceRef = getQuestionnaireResponseRef(sourceOrder);
          if (sourceRef?.reference) {
            setQuestionnaireResponse(await medplum.readReference(sourceRef as Reference<QuestionnaireResponse>));
          }
        } catch (error) {
          console.error('Error fetching questionnaire response from original order:', error);
        }
      }
    };

    fetchQuestionnaireResponse().catch(console.error);

    // Cleanup function
    return () => {
      setQuestionnaireResponse(undefined);
    };
  }, [medplum, order]);

  // When the caller passed a selectedReport, always show that exact resource - resolved directly
  // by reference, never substituted with a different report. Otherwise fall back to the most
  // recently updated report.
  const latestReport = diagnosticReports.length > 0 ? diagnosticReports[0] : undefined;
  const primaryReport = selectedReport ? selectedReportResource : latestReport;
  // While this is true, we don't yet know whether a report exists - keep the Report tab visible
  // (with a loader) rather than flipping it away only to potentially flip it back once the fetch
  // resolves, and don't bounce the user off the Report tab just because it isn't resolved yet.
  const reportLoading = selectedReport ? selectedReportResource === undefined : !reportsFetched;
  const reportAttachments = useLabReportAttachments(primaryReport);
  const reportResources = useDiagnosticReportResources(primaryReport);

  return (
    <LabOrderDetailsView
      order={order}
      patient={subject?.resourceType === 'Patient' ? subject : undefined}
      requester={requester?.resourceType === 'Practitioner' ? requester : undefined}
      report={primaryReport}
      reportLoading={reportLoading}
      reportAttachments={reportAttachments}
      reportResources={reportResources}
      requisitionDocuments={labOrderRequisitionDocs}
      requisitionDocumentsLoading={loadingDocs}
      specimenLabelDocuments={specimenLabelDocs}
      specimenLabelDocumentsLoading={loadingSpecimenDocs}
      questionnaireResponse={questionnaireResponse}
      defaultTab={selectedReport ? 'report' : undefined}
      onRevoke={() => handleRevoke().catch(console.error)}
      onResume={onResume}
      renderLink={renderMedplumLink}
    />
  );
}
