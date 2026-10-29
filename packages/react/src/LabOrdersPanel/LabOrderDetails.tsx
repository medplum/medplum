// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Divider, Group, Loader, Menu, Stack, Tabs, Text, ThemeIcon, Timeline } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { formatDate, formatHumanName, normalizeErrorString } from '@medplum/core';
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
import { IconCheck, IconChevronDown, IconClipboardCheck, IconFlask, IconSend } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import classes from '../ListWithDetailPane/ListWithDetailPane.module.css';
import { fetchLabOrderRequisitionDocuments, getHealthGorillaRequisitionId } from './documentReference';
import { LabDetailLayout } from './LabDetailLayout';
import {
  getOrderDisplayText,
  getOrderStatusColor,
  getOrderStatusDisplayText,
  getQuestionnaireResponseRef,
} from './labOrder';
import { LabReportContent } from './LabReportContent';

export interface LabOrderDetailsProps {
  order: ServiceRequest;
  onChange?: (order: WithId<ServiceRequest>) => void;
  onResume?: () => void;
  selectedReport?: Reference<DiagnosticReport>;
}

interface ProgressStep {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  status: 'completed' | 'current' | 'pending';
  timestamp?: string;
}

export function LabOrderDetails(props: LabOrderDetailsProps): JSX.Element {
  const { order, onChange, onResume, selectedReport } = props;
  const medplum = useMedplum();
  const patient = useResource(order.subject);
  const requester = useResource(order.requester);
  const selectedReportResource = useResource(selectedReport);
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([]);
  const [labOrderRequisitionDocs, setLabOrderRequisitionDocs] = useState<DocumentReference[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [specimenLabelDocs, setSpecimenLabelDocs] = useState<DocumentReference[]>([]);
  const [loadingSpecimenDocs, setLoadingSpecimenDocs] = useState(false);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | null>(null);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'report' | 'progress' | 'order'>(
    order.status !== 'completed' ? 'progress' : 'report'
  );

  const canRevoke = order.status === 'draft' || order.status === 'active' || order.status === 'on-hold';
  const isDraft = order.status === 'draft';
  const hideProgress = isDraft || order.status === 'revoked';
  const detailTab = hideProgress ? 'order' : activeDetailTab;

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
    };

    fetchReports().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, order.id, selectedReport]);

  // When the caller passed a selectedReport, always show that exact resource - resolved directly
  // by reference, never substituted with a different report. Otherwise fall back to the most
  // recently updated report.
  const latestReport = diagnosticReports.length > 0 ? diagnosticReports[0] : undefined;
  const primaryReport = selectedReport ? selectedReportResource : latestReport;

  // Progress tracker logic
  const getProgressSteps = useMemo((): ProgressStep[] => {
    const steps: ProgressStep[] = [
      {
        id: 'order-sent',
        title: 'Order Sent',
        description: 'Lab order has been submitted',
        icon: <IconSend size={16} />,
        status: 'completed',
        timestamp:
          order.authoredOn || order.meta?.lastUpdated
            ? formatDate(order.authoredOn || order.meta?.lastUpdated)
            : undefined,
      },
      {
        id: 'lab-acknowledged',
        title: 'Order Acknowledged',
        description: 'Lab has received and acknowledged the order',
        icon: <IconCheck size={16} />,
        status: 'pending',
      },
      {
        id: 'testing',
        title: 'Testing',
        description: 'Lab is processing the sample',
        icon: <IconFlask size={16} />,
        status: 'pending',
      },
      {
        id: 'final',
        title: 'Final',
        description: 'Results are ready',
        icon: <IconClipboardCheck size={16} />,
        status: 'pending',
      },
    ];

    // Determine current step based on available data
    let currentStepIndex = 0;

    // Step 1: Order Sent - always completed if order exists
    if (order.authoredOn) {
      currentStepIndex = 1;
    }

    // Step 2: Lab Acknowledged - presence of accession number or LabOrderRequisition
    if (order.requisition?.value || labOrderRequisitionDocs.length > 0) {
      steps[1].status = 'completed';
      steps[1].timestamp = order.requisition?.value ? 'Acknowledged' : undefined;
      currentStepIndex = 2;
    }

    // Step 3: Testing - DiagnosticReport.effectiveDateTime
    if (primaryReport?.effectiveDateTime) {
      steps[2].status = 'completed';
      steps[2].timestamp = formatDate(primaryReport.effectiveDateTime);
      currentStepIndex = 3;
    }

    // Step 4: Final - DiagnosticReport.issued timestamp
    if (primaryReport?.issued && primaryReport.status === 'final') {
      steps[3].status = 'completed';
      steps[3].timestamp = formatDate(primaryReport.issued);
      currentStepIndex = 4;
    }

    // Set current step
    if (currentStepIndex < steps.length) {
      steps[currentStepIndex].status = 'current';
    }

    return steps;
  }, [order, primaryReport, labOrderRequisitionDocs]);

  // Helper function to get step color
  const getStepColor = (status: 'completed' | 'current' | 'pending'): string => {
    if (status === 'completed') {
      return 'green';
    }
    if (status === 'current') {
      return 'blue';
    }
    return 'gray.2';
  };

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
      setQuestionnaireResponse(null);

      // First, check if current order has QuestionnaireResponse in supportingInfo
      const currentRef = getQuestionnaireResponseRef(order);
      if (currentRef?.reference) {
        try {
          setLoadingQuestionnaire(true);
          setQuestionnaireResponse(await medplum.readReference(currentRef as Reference<QuestionnaireResponse>));
          return;
        } catch (error) {
          console.error('Error fetching questionnaire response from current order:', error);
        } finally {
          setLoadingQuestionnaire(false);
        }
      }

      // For HealthGorilla case: if no QuestionnaireResponse found in current order,
      // search for the original ServiceRequest that has this ServiceRequest in its basedOn field
      // This applies to both open and completed orders
      if (order.id) {
        try {
          setLoadingQuestionnaire(true);

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
        } finally {
          setLoadingQuestionnaire(false);
        }
      }
    };

    fetchQuestionnaireResponse().catch(console.error);

    // Cleanup function
    return () => {
      setQuestionnaireResponse(null);
      setLoadingQuestionnaire(false);
    };
  }, [medplum, order]);

  return (
    <LabDetailLayout
      title={getOrderDisplayText(order)}
      subtitle={
        order.status === 'completed' && order.meta?.lastUpdated
          ? `Completed ${formatDate(order.meta.lastUpdated)} • Ordered ${formatDate(order.authoredOn || order.meta?.lastUpdated)}`
          : `Ordered ${formatDate(order.authoredOn || order.meta?.lastUpdated)}`
      }
      actions={
        <Group justify="space-between" align="center">
          <Tabs
            value={detailTab}
            onChange={(value) => setActiveDetailTab(value as 'report' | 'progress' | 'order')}
            variant="unstyled"
            className={classes.pillTabs}
          >
            <Tabs.List>
              {!hideProgress && (
                <Tabs.Tab value={order.status !== 'completed' ? 'progress' : 'report'}>
                  {order.status !== 'completed' ? 'Progress Tracker' : 'Report'}
                </Tabs.Tab>
              )}
              <Tabs.Tab value="order">Order Details</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Button
                variant="light"
                color={getOrderStatusColor(order.status)}
                rightSection={canRevoke ? <IconChevronDown size={16} /> : undefined}
                radius="xl"
                size="sm"
              >
                {getOrderStatusDisplayText(order.status)}
              </Button>
            </Menu.Target>
            {canRevoke && (
              <Menu.Dropdown>
                {isDraft && onResume && <Menu.Item onClick={onResume}>Active</Menu.Item>}
                <Menu.Item onClick={() => handleRevoke().catch(console.error)}>Revoked</Menu.Item>
              </Menu.Dropdown>
            )}
          </Menu>
        </Group>
      }
    >
      {/* Order Details Tab Content */}
      {detailTab === 'order' && (
        <Stack gap="md">
          <Stack gap="sm" mb="xl">
            <DetailRow label="Order Date">
              <Text size="sm">{formatDate(order.authoredOn || order.meta?.lastUpdated)}</Text>
            </DetailRow>

            {order.code?.coding && (
              <DetailRow label="Test Code">
                <Stack gap="xs">
                  {order.code.coding.map((coding, index) => (
                    <Text key={index} size="sm">
                      {coding.display} ({coding.code})
                    </Text>
                  ))}
                </Stack>
              </DetailRow>
            )}

            {requester?.resourceType === 'Practitioner' && (
              <DetailRow label="Ordering provider">
                <Text size="sm">{formatHumanName(requester.name?.[0])}</Text>
              </DetailRow>
            )}

            {order.performer?.[0]?.display && (
              <DetailRow label="Performing lab">
                <Text size="sm">{order.performer[0].display}</Text>
              </DetailRow>
            )}

            {order.requisition?.value && (
              <DetailRow label="Requisition ID">
                <Text size="sm">{order.requisition.value}</Text>
              </DetailRow>
            )}

            {patient?.resourceType === 'Patient' && (
              <DetailRow label="Patient">
                <Text size="sm">{formatHumanName(patient.name?.[0])}</Text>
              </DetailRow>
            )}

            {order.priority && (
              <DetailRow label="Priority">
                <Text size="sm">{order.priority}</Text>
              </DetailRow>
            )}

            {order.reasonCode && (
              <DetailRow label="Reason">
                <Stack gap="xs">
                  {order.reasonCode.map((reason, index) => (
                    <Text key={index} size="sm">
                      {reason.text || reason.coding?.[0]?.display}
                    </Text>
                  ))}
                </Stack>
              </DetailRow>
            )}

            {order.note && (
              <DetailRow label="Notes">
                <Stack gap="xs">
                  {order.note.map((note, index) => (
                    <Text key={index} size="sm">
                      {note.text}
                    </Text>
                  ))}
                </Stack>
              </DetailRow>
            )}

            {order.orderDetail && (
              <>
                <Divider />
                <Stack gap="sm">
                  <Text fw={800} size="lg">
                    Order Details
                  </Text>
                  {order.orderDetail.map((detail, index) => (
                    <Group key={index} align="flex-start">
                      <Text fw={500} size="sm">
                        Detail {index + 1}:
                      </Text>
                      <Text size="sm">{detail.text || detail.coding?.[0]?.display}</Text>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </Stack>

          {/* Lab Order Requisition Documents - show for both open and completed items */}
          <Divider />
          <Stack gap="lg" mb="xl">
            <Text fw={800} size="md" pb="0">
              Requisition Document
            </Text>
            {loadingDocs && (
              <Group>
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading requisition documents...
                </Text>
              </Group>
            )}

            {!loadingDocs && labOrderRequisitionDocs.length > 0 && (
              <Stack gap="md">
                {labOrderRequisitionDocs.map((doc, index) => (
                  <Stack key={doc.id || index} gap="xs">
                    {doc.content && doc.content.length > 0 && (
                      <Stack gap="xs">
                        {doc.content.map((content, contentIndex) => (
                          <div
                            key={contentIndex}
                            style={{
                              height: '600px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid #3C3C3C',
                            }}
                          >
                            <style>
                              {`
                            div[data-testid="attachment-iframe"] {
                              height: 600px !important;
                            }
                            div[data-testid="attachment-iframe"] iframe {
                              height: 600px !important;
                            }
                          `}
                            </style>
                            <AttachmentDisplay value={content.attachment} />
                          </div>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}

            {!loadingDocs && labOrderRequisitionDocs.length === 0 && (
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  No lab order requisition documents found.
                </Text>
              </Stack>
            )}
          </Stack>

          {/* Order Entry Questions - show when QuestionnaireResponse is linked */}
          {questionnaireResponse && (
            <>
              <Divider />
              <Stack gap="md" mb="xl">
                <Text fw={800} size="md">
                  Order Entry Questions
                </Text>

                {loadingQuestionnaire && (
                  <Group>
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                      Loading questionnaire response...
                    </Text>
                  </Group>
                )}

                {!loadingQuestionnaire && questionnaireResponse && (
                  <Stack gap="sm">
                    {questionnaireResponse.item && questionnaireResponse.item.length > 0 ? (
                      questionnaireResponse.item.map((item, index) => (
                        <Group key={index} align="flex-start" style={{ alignItems: 'flex-start' }} gap="lg">
                          <div style={{ width: '150px', flexShrink: 0 }}>
                            <Text fw={500} size="sm" c="dimmed">
                              {item.text || item.linkId || `Question ${index + 1}`}
                            </Text>
                          </div>
                          <div style={{ flex: 1 }}>
                            {item.answer && item.answer.length > 0 ? (
                              <Stack gap="xs">
                                {item.answer.map((answer, answerIndex) => {
                                  // Extract the answer value based on FHIR QuestionnaireResponse answer types
                                  let answerText = 'No answer provided';

                                  if (answer.valueString) {
                                    answerText = answer.valueString;
                                  } else if (answer.valueCoding?.display) {
                                    answerText = answer.valueCoding.display;
                                  } else if (answer.valueCoding?.code) {
                                    answerText = `${answer.valueCoding.code}${answer.valueCoding.display ? ` - ${answer.valueCoding.display}` : ''}`;
                                  } else if (answer.valueBoolean !== undefined) {
                                    answerText = answer.valueBoolean.toString();
                                  } else if (answer.valueInteger !== undefined) {
                                    answerText = answer.valueInteger.toString();
                                  } else if (answer.valueDecimal !== undefined) {
                                    answerText = answer.valueDecimal.toString();
                                  } else if (answer.valueDate) {
                                    answerText = answer.valueDate;
                                  } else if (answer.valueDateTime) {
                                    answerText = answer.valueDateTime;
                                  } else if (answer.valueTime) {
                                    answerText = answer.valueTime;
                                  } else if (answer.valueUri) {
                                    answerText = answer.valueUri;
                                  } else if (answer.valueQuantity) {
                                    answerText = `${answer.valueQuantity.value}${answer.valueQuantity.unit ? ` ${answer.valueQuantity.unit}` : ''}`;
                                  } else if (answer.valueReference?.display) {
                                    answerText = answer.valueReference.display;
                                  } else if (answer.valueReference?.reference) {
                                    answerText = answer.valueReference.reference;
                                  } else if (answer.valueAttachment?.title) {
                                    answerText = answer.valueAttachment.title;
                                  } else if (answer.valueAttachment?.url) {
                                    answerText = answer.valueAttachment.url;
                                  }

                                  return (
                                    <Text key={answerIndex} size="sm">
                                      {answerText}
                                    </Text>
                                  );
                                })}
                              </Stack>
                            ) : (
                              <Text size="sm" c="dimmed">
                                No answer provided
                              </Text>
                            )}
                          </div>
                        </Group>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed">
                        No questionnaire items found.
                      </Text>
                    )}
                  </Stack>
                )}
              </Stack>
            </>
          )}

          {/* Specimen Label Documents - show for both open and completed items */}
          <Divider />
          <Stack gap="lg" mb="xl">
            <Text fw={800} size="md" pb="0">
              Specimen Label
            </Text>
            {loadingSpecimenDocs && (
              <Group>
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading specimen label documents...
                </Text>
              </Group>
            )}

            {!loadingSpecimenDocs && specimenLabelDocs.length > 0 && (
              <Stack gap="md">
                {specimenLabelDocs.map((doc, index) => (
                  <Stack key={doc.id || index} gap="xs">
                    {doc.content && doc.content.length > 0 && (
                      <Stack gap="xs">
                        {doc.content.map((content, contentIndex) => (
                          <div
                            key={contentIndex}
                            style={{
                              height: '600px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid #3C3C3C',
                            }}
                          >
                            <style>
                              {`
                            div[data-testid="attachment-iframe"] {
                              height: 600px !important;
                            }
                            div[data-testid="attachment-iframe"] iframe {
                              height: 600px !important;
                            }
                          `}
                            </style>
                            <AttachmentDisplay value={content.attachment} />
                          </div>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}

            {!loadingSpecimenDocs && specimenLabelDocs.length === 0 && (
              <Text size="sm" c="dimmed">
                No specimen label documents found.
              </Text>
            )}
          </Stack>
        </Stack>
      )}

      {/* Progress Tracker Tab Content - for open items */}
      {detailTab === 'progress' && (
        <Stack gap="md">
          <Stack p="xl" align="center">
            <Timeline
              active={getProgressSteps.findIndex((step) => step.status === 'current')}
              bulletSize={24}
              lineWidth={2}
              color="green"
              styles={{
                root: {
                  maxWidth: '400px',
                },
              }}
            >
              {getProgressSteps.map((step, index) => {
                const nextStep = getProgressSteps[index + 1];
                const isCurrentToNext = step.status === 'current' && nextStep;
                const isCompletedToCompleted = step.status === 'completed' && nextStep?.status === 'completed';
                const isCompletedToCurrent = step.status === 'completed' && nextStep?.status === 'current';
                const isPendingToPending = step.status === 'pending' && nextStep?.status === 'pending';

                return (
                  <Timeline.Item
                    key={step.id}
                    lineVariant={isCurrentToNext || isPendingToPending ? 'dotted' : 'solid'}
                    bullet={
                      <ThemeIcon
                        size={32}
                        radius="xl"
                        color={getStepColor(step.status)}
                        variant="filled"
                        style={{
                          color: step.status === 'pending' ? 'var(--mantine-color-gray-8)' : undefined,
                        }}
                        data-completed-to-completed={isCompletedToCompleted ? 'true' : undefined}
                        data-completed-to-current={isCompletedToCurrent ? 'true' : undefined}
                      >
                        {step.icon}
                      </ThemeIcon>
                    }
                    title={
                      <Group gap="xs" align="center">
                        <Text fw={step.status === 'current' ? 600 : 500} size="sm">
                          {step.title}
                        </Text>
                        {step.timestamp && (
                          <Badge size="xs" variant="light" color="gray">
                            {step.timestamp}
                          </Badge>
                        )}
                      </Group>
                    }
                  >
                    <Text size="sm" c="dimmed">
                      {step.description}
                    </Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </Stack>
        </Stack>
      )}

      {/* Report Tab Content - for completed items */}
      {detailTab === 'report' && primaryReport && <LabReportContent report={primaryReport} />}
    </LabDetailLayout>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Group align="flex-start" gap="lg">
      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
        {label}
      </Text>
      {children}
    </Group>
  );
}
