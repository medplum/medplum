// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Paper,
  Stack,
  Text,
  Group,
  Badge,
  Divider,
  Loader,
  Button,
  Timeline,
  ThemeIcon,
  ScrollArea,
} from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type {
  ServiceRequest,
  HumanName,
  DocumentReference,
  DiagnosticReport,
  QuestionnaireResponse,
  MedicationRequest,
  Reference,
  CarePlan,
} from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useResource, useMedplum, AttachmentDisplay, ObservationTable } from '@medplum/react';
import { IconSend, IconCheck, IconFlask, IconClipboardCheck } from '@tabler/icons-react';
import { useState, useEffect, useMemo } from 'react';
import { fetchLabOrderRequisitionDocuments, getHealthGorillaRequisitionId } from '../../utils/documentReference';
import classes from './LabOrderDetails.module.css';
import cx from 'clsx';

interface LabOrderDetailsProps {
  order: ServiceRequest;
  onOrderChange: (order: ServiceRequest) => void;
  diagnosticReports?: DiagnosticReport[];
  activeTab?: 'open' | 'completed';
}

interface ProgressStep {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  status: 'completed' | 'current' | 'pending';
  timestamp?: string;
}

export function LabOrderDetails({
  order,
  onOrderChange: _onOrderChange,
  diagnosticReports: allDiagnosticReports,
  activeTab,
}: LabOrderDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const patient = useResource(order.subject);
  const requester = useResource(order.requester);
  const [labOrderRequisitionDocs, setLabOrderRequisitionDocs] = useState<DocumentReference[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);
  const [specimenLabelDocs, setSpecimenLabelDocs] = useState<DocumentReference[]>([]);
  const [loadingSpecimenDocs, setLoadingSpecimenDocs] = useState<boolean>(false);
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | null>(null);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState<boolean>(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'report' | 'progress' | 'order'>('report');

  // Set default tab based on activeTab
  useEffect(() => {
    if (activeTab === 'open') {
      setActiveDetailTab('progress');
    } else {
      setActiveDetailTab('report');
    }
  }, [activeTab]);

  // Filter DiagnosticReports for this specific order
  const diagnosticReports = useMemo(() => {
    if (!allDiagnosticReports || !order.id) {
      return [];
    }
    return allDiagnosticReports.filter((report) =>
      report.basedOn?.some((ref) => ref.reference === `ServiceRequest/${order.id}`)
    );
  }, [allDiagnosticReports, order.id]);

  // Get the primary diagnostic report for this order
  const primaryReport = diagnosticReports.length > 0 ? diagnosticReports[0] : undefined;

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
      if (order.supportingInfo && order.supportingInfo.length > 0) {
        const questionnaireRef = order.supportingInfo.find((ref) =>
          ref.reference?.startsWith('QuestionnaireResponse/')
        );

        if (questionnaireRef?.reference) {
          try {
            setLoadingQuestionnaire(true);
            const response = await medplum.readResource(
              'QuestionnaireResponse',
              questionnaireRef.reference.split('/')[1]
            );
            setQuestionnaireResponse(response);
            return;
          } catch (error) {
            console.error('Error fetching questionnaire response from current order:', error);
          } finally {
            setLoadingQuestionnaire(false);
          }
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

          if (searchResult && searchResult.length > 0) {
            // Find the ServiceRequest that has this order in its basedOn field
            // Prioritize those that also have QuestionnaireResponse in supportingInfo
            const originalOrder = searchResult.find((sr: ServiceRequest) => {
              if (sr.basedOn && sr.basedOn.length > 0) {
                const hasBasedOnMatch = sr.basedOn.some(
                  (ref: Reference<CarePlan | ServiceRequest | MedicationRequest>) =>
                    ref.reference === `ServiceRequest/${order.id}`
                );

                if (hasBasedOnMatch) {
                  // Check if this ServiceRequest also has QuestionnaireResponse in supportingInfo
                  return sr.supportingInfo?.some((ref) => ref.reference?.startsWith('QuestionnaireResponse/')) ?? false;
                }
                return false;
              }
              return false;
            });

            if (originalOrder) {
              // Check if original order has QuestionnaireResponse in supportingInfo
              if (originalOrder.supportingInfo && originalOrder.supportingInfo.length > 0) {
                const questionnaireRef = originalOrder.supportingInfo.find((ref) =>
                  ref.reference?.startsWith('QuestionnaireResponse/')
                );

                if (questionnaireRef?.reference) {
                  const response = await medplum.readResource(
                    'QuestionnaireResponse',
                    questionnaireRef.reference.split('/')[1]
                  );
                  setQuestionnaireResponse(response);
                }
              }
            } else {
              // Alternative: Look for any ServiceRequest with QuestionnaireResponse in supportingInfo
              const serviceRequestWithQuestionnaire = searchResult.find((sr: ServiceRequest) =>
                sr.supportingInfo?.some((ref) => ref.reference?.startsWith('QuestionnaireResponse/'))
              );

              if (serviceRequestWithQuestionnaire) {
                const questionnaireRef = serviceRequestWithQuestionnaire.supportingInfo?.find((ref) =>
                  ref.reference?.startsWith('QuestionnaireResponse/')
                );

                if (questionnaireRef?.reference) {
                  const response = await medplum.readResource(
                    'QuestionnaireResponse',
                    questionnaireRef.reference.split('/')[1]
                  );
                  setQuestionnaireResponse(response);
                }
              }
            }
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
    <ScrollArea h="100%">
      <Paper h="100%">
        <Stack gap="0">
          <Stack gap="md" p="md">
            <Stack gap="md">
              <Stack gap="0">
                <Text size="xl" fw={800}>
                  {(() => {
                    // If there are multiple codes (2 or more), show them separated by commas
                    if (order.code?.coding && order.code.coding.length >= 2) {
                      return order.code.coding.map((coding) => coding.display).join(', ');
                    }

                    // If there's a text field and only one code, use the text field
                    if (order.code?.text) {
                      return order.code.text;
                    }

                    // Otherwise, show the first code or fallback
                    return order.code?.coding?.[0]?.display || 'Lab Order';
                  })()}
                </Text>
                <Text size="sm" c="gray.7">
                  {order.status === 'completed' && order.meta?.lastUpdated
                    ? `Completed ${formatDate(order.meta.lastUpdated)} • Ordered ${formatDate(order.authoredOn || order.meta?.lastUpdated)}`
                    : `Ordered ${formatDate(order.authoredOn || order.meta?.lastUpdated)}`}
                </Text>
              </Stack>
              <Divider />
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <Button
                    className={cx(classes.button, {
                      [classes.selected]: activeDetailTab === (activeTab === 'open' ? 'progress' : 'report'),
                    })}
                    h={32}
                    radius="xl"
                    onClick={() => setActiveDetailTab(activeTab === 'open' ? 'progress' : 'report')}
                  >
                    {activeTab === 'open' ? 'Progress Tracker' : 'Report'}
                  </Button>
                  <Button
                    className={cx(classes.button, { [classes.selected]: activeDetailTab === 'order' })}
                    h={32}
                    radius="xl"
                    onClick={() => setActiveDetailTab('order')}
                  >
                    Order Details
                  </Button>
                </Group>
                <Badge size="lg" color={getStatusColor(order.status)} variant="light">
                  {getStatusDisplayText(order.status)}
                </Badge>
              </Group>
            </Stack>
          </Stack>

          <Stack gap="xs" p="md">
            {/* Order Details Tab Content */}
            {activeDetailTab === 'order' && (
              <Stack gap="md">
                <Stack gap="sm" mb="xl">
                  <Group align="flex-start" gap="lg">
                    <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                      Order Date
                    </Text>
                    <Text size="sm">{formatDate(order.authoredOn || order.meta?.lastUpdated)}</Text>
                  </Group>

                  {order.code?.coding && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Test Code
                      </Text>
                      <Stack gap="xs">
                        {order.code.coding.map((coding, index) => (
                          <Text key={index} size="sm">
                            {coding.display} ({coding.code})
                          </Text>
                        ))}
                      </Stack>
                    </Group>
                  )}

                  {requester?.resourceType === 'Practitioner' && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Ordering provider
                      </Text>
                      <Text size="sm">{formatHumanName(requester.name?.[0] as HumanName)}</Text>
                    </Group>
                  )}

                  {order.performer?.[0]?.display && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Performing lab
                      </Text>
                      <Text size="sm">{order.performer[0].display}</Text>
                    </Group>
                  )}

                  {order.requisition?.value && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Requisition ID
                      </Text>
                      <Text size="sm">{order.requisition.value}</Text>
                    </Group>
                  )}

                  {patient?.resourceType === 'Patient' && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Patient
                      </Text>
                      <Text size="sm">{formatHumanName(patient.name?.[0] as HumanName)}</Text>
                    </Group>
                  )}

                  {order.priority && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Priority
                      </Text>
                      <Text size="sm">{order.priority}</Text>
                    </Group>
                  )}

                  {order.reasonCode && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Reason
                      </Text>
                      <Stack gap="xs">
                        {order.reasonCode.map((reason, index) => (
                          <Text key={index} size="sm">
                            {reason.text || reason.coding?.[0]?.display}
                          </Text>
                        ))}
                      </Stack>
                    </Group>
                  )}

                  {order.note && (
                    <Group align="flex-start" gap="lg">
                      <Text fw={500} size="sm" style={{ width: '150px' }} c="dimmed">
                        Notes
                      </Text>
                      <Stack gap="xs">
                        {order.note.map((note, index) => (
                          <Text key={index} size="sm">
                            {note.text}
                          </Text>
                        ))}
                      </Stack>
                    </Group>
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
            {activeDetailTab === 'progress' && activeTab === 'open' && (
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
            {activeDetailTab === 'report' && activeTab === 'completed' && primaryReport && (
              <Stack gap="sm" mb="xl">
                {primaryReport.result && primaryReport.result.length > 0 && (
                  <Stack pt="md">
                    <ObservationTable value={primaryReport.result} hideObservationNotes={false} />
                  </Stack>
                )}

                <Stack mt="md">
                  <Group align="flex-start">
                    <Text fw={500} size="sm" style={{ minWidth: '150px' }} c="dimmed">
                      Report Status
                    </Text>
                    <Text size="sm" style={{ textTransform: 'capitalize' }}>
                      {primaryReport.status}
                    </Text>
                  </Group>

                  {primaryReport.issued && (
                    <Group align="flex-start">
                      <Text fw={500} size="sm" style={{ minWidth: '150px' }} c="dimmed">
                        Issue Date
                      </Text>
                      <Text size="sm">{formatDate(primaryReport.issued)}</Text>
                    </Group>
                  )}

                  {primaryReport.conclusion && (
                    <Group align="flex-start">
                      <Text fw={500} size="sm" style={{ minWidth: '150px' }} c="dimmed">
                        Interpretation
                      </Text>
                      <Text size="sm">{primaryReport.conclusion}</Text>
                    </Group>
                  )}
                </Stack>

                {/* Results PDF */}
                {primaryReport?.presentedForm && primaryReport.presentedForm.length > 0 && (
                  <>
                    <Divider mt="xl" />
                    <Stack gap="lg" mb="xl">
                      <Text fw={800} size="md" pb="0">
                        Lab Document
                      </Text>
                      <Stack gap="md">
                        {primaryReport.presentedForm.map((form, index) => (
                          <Stack key={index} gap="xs">
                            <div
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
                              <AttachmentDisplay value={form} />
                            </div>
                          </Stack>
                        ))}
                      </Stack>
                    </Stack>
                  </>
                )}
              </Stack>
            )}
          </Stack>
        </Stack>
      </Paper>
    </ScrollArea>
  );
}

const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'blue';
    case 'draft':
    case 'requested':
      return 'yellow';
    case 'on-hold':
      return 'orange';
    case 'revoked':
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    case 'completed':
      return 'green';
    case 'unknown':
      return 'gray';
    default:
      return 'gray';
  }
};

const getStatusDisplayText = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'draft':
      return 'Draft';
    case 'requested':
      return 'Requested';
    case 'on-hold':
      return 'On Hold';
    case 'revoked':
      return 'Revoked';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    case 'completed':
      return 'Completed';
    case 'unknown':
      return 'Unknown';
    default:
      return status || 'Unknown';
  }
};
