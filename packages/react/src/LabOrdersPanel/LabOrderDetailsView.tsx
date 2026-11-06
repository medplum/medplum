// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Divider, Group, Loader, Menu, Stack, Tabs, Text, ThemeIcon, Timeline } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type {
  Attachment,
  DiagnosticReport,
  DocumentReference,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { IconCheck, IconChevronDown, IconClipboardCheck, IconFlask, IconSend } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { RenderResourceLink } from '../DiagnosticReportDisplay/DiagnosticReportDisplayView';
import classes from '../ListWithDetailPane/ListWithDetailPane.module.css';
import { LabDetailLayout } from './LabDetailLayout';
import { LabDocumentSection } from './LabDocumentSection';
import { getOrderDisplayText, getOrderStatusColor, getOrderStatusDisplayText } from './labOrder';
import { LabReportContentView } from './LabReportContentView';

export type LabOrderDetailTab = 'report' | 'progress' | 'order';

export interface LabOrderDetailsViewProps {
  readonly order: ServiceRequest;
  /** The order's patient, resolved by the caller. */
  readonly patient?: Patient;
  /** The ordering practitioner, resolved by the caller. */
  readonly requester?: Practitioner;
  /** The report to show: the one the caller selected, or the order's latest. */
  readonly report?: DiagnosticReport;
  /** True while the caller is still finding the report. Keeps the Report tab while it loads. */
  readonly reportLoading?: boolean;
  /** The report's lab documents, resolved by the caller. See LabReportContentView. */
  readonly reportAttachments?: Attachment[];
  /** The resources the report references, resolved by the caller. See DiagnosticReportDisplayView. */
  readonly reportResources?: Resource[];
  /** The lab order requisition documents, resolved by the caller. */
  readonly requisitionDocuments?: DocumentReference[];
  readonly requisitionDocumentsLoading?: boolean;
  /** The specimen label documents, resolved by the caller. */
  readonly specimenLabelDocuments?: DocumentReference[];
  readonly specimenLabelDocumentsLoading?: boolean;
  /** The order entry questions, resolved by the caller. */
  readonly questionnaireResponse?: QuestionnaireResponse;
  /** The tab open at first. Default: Report for a completed order, otherwise Progress Tracker. */
  readonly defaultTab?: LabOrderDetailTab;
  /** Revokes the order. Omitted: the status menu offers no Revoked item. */
  readonly onRevoke?: () => void;
  /** Resumes a draft order. Omitted: the status menu offers no Active item. */
  readonly onResume?: () => void;
  /** Renders the links in the report display. Default: no links. */
  readonly renderLink?: RenderResourceLink;
}

interface ProgressStep {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  status: 'completed' | 'current' | 'pending';
  timestamp?: string;
}

/**
 * The details of a lab order: its report, its progress, and its order details. It holds no
 * client: the caller resolves the report, the documents, and the people, and performs the
 * status changes.
 * @param props - The order and its resolved data.
 * @returns The order details.
 */
export function LabOrderDetailsView(props: LabOrderDetailsViewProps): JSX.Element {
  const {
    order,
    patient,
    requester,
    report,
    reportLoading = false,
    reportAttachments,
    reportResources,
    requisitionDocuments = [],
    requisitionDocumentsLoading = false,
    specimenLabelDocuments = [],
    specimenLabelDocumentsLoading = false,
    questionnaireResponse,
    defaultTab,
    onRevoke,
    onResume,
    renderLink,
  } = props;
  // Default to the Report tab whenever the caller explicitly selected a report (e.g. clicked one
  // from a results list) or the order is fully completed - in every other case there's nothing
  // to show there yet, so default to tracking progress instead. This is only the *initial* tab;
  // availability of the Report tab itself is governed separately, by whether a report exists
  // rather than by order status, since a report can exist well before the order it belongs to is
  // marked completed (e.g. a preliminary or partial result).
  const [activeDetailTab, setActiveDetailTab] = useState<LabOrderDetailTab>(
    defaultTab ?? (order.status === 'completed' ? 'report' : 'progress')
  );

  const canRevoke = order.status === 'draft' || order.status === 'active' || order.status === 'on-hold';
  const isDraft = order.status === 'draft';
  const hideProgress = isDraft || order.status === 'revoked';
  const hasStatusMenu = canRevoke && (onRevoke !== undefined || (isDraft && onResume !== undefined));

  // The tab actually shown, derived from the requested tab plus two corrections:
  // - once loading finishes with no report found, a request for 'report' has nothing to show, so
  //   fall back to a tab that does (e.g. a completed order whose report search came back empty);
  // - 'progress' is requested but genuinely hidden (hideProgress), so fall back to 'order'. This
  //   never overrides a 'report' request on a draft/revoked order - the report tab's own
  //   availability is governed separately, by whether a report exists, so a draft or revoked
  //   order with a report (e.g. a preliminary result opened from Completed) must still be able to
  //   select and view it instead of being stuck on Order Details.
  let detailTab: LabOrderDetailTab = activeDetailTab;
  if (!reportLoading && !report && activeDetailTab === 'report') {
    detailTab = hideProgress ? 'order' : 'progress';
  } else if (hideProgress && activeDetailTab === 'progress') {
    detailTab = 'order';
  }

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
    if (order.requisition?.value || requisitionDocuments.length > 0) {
      steps[1].status = 'completed';
      steps[1].timestamp = order.requisition?.value ? 'Acknowledged' : undefined;
      currentStepIndex = 2;
    }

    // Step 3: Testing - DiagnosticReport.effectiveDateTime
    if (report?.effectiveDateTime) {
      steps[2].status = 'completed';
      steps[2].timestamp = formatDate(report.effectiveDateTime);
      currentStepIndex = 3;
    }

    // Step 4: Final - DiagnosticReport.issued timestamp
    if (report?.issued && report.status === 'final') {
      steps[3].status = 'completed';
      steps[3].timestamp = formatDate(report.issued);
      currentStepIndex = 4;
    }

    // Set current step
    if (currentStepIndex < steps.length) {
      steps[currentStepIndex].status = 'current';
    }

    return steps;
  }, [order, report, requisitionDocuments]);

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
            onChange={(value) => setActiveDetailTab(value as LabOrderDetailTab)}
            variant="unstyled"
            className={classes.pillTabs}
          >
            <Tabs.List>
              {(reportLoading || report) && <Tabs.Tab value="report">Report</Tabs.Tab>}
              {!hideProgress && <Tabs.Tab value="progress">Progress Tracker</Tabs.Tab>}
              <Tabs.Tab value="order">Order Details</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Button
                variant="light"
                color={getOrderStatusColor(order.status)}
                rightSection={hasStatusMenu ? <IconChevronDown size={16} /> : undefined}
                radius="xl"
                size="sm"
              >
                {getOrderStatusDisplayText(order.status)}
              </Button>
            </Menu.Target>
            {hasStatusMenu && (
              <Menu.Dropdown>
                {isDraft && onResume && <Menu.Item onClick={onResume}>Active</Menu.Item>}
                {onRevoke && <Menu.Item onClick={onRevoke}>Revoked</Menu.Item>}
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

            {requester && (
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

            {patient && (
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

          <Divider />
          <LabDocumentSection
            title="Requisition Document"
            loading={requisitionDocumentsLoading}
            loadingText="Loading requisition documents..."
            emptyText="No lab order requisition documents found."
            docs={requisitionDocuments}
          />

          {/* Order Entry Questions - show when QuestionnaireResponse is linked */}
          {questionnaireResponse && (
            <>
              <Divider />
              <Stack gap="md" mb="xl">
                <Text fw={800} size="md">
                  Order Entry Questions
                </Text>

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
                              {item.answer.map((answer, answerIndex) => (
                                <Text key={answerIndex} size="sm">
                                  {getAnswerText(answer)}
                                </Text>
                              ))}
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
              </Stack>
            </>
          )}

          <Divider />
          <LabDocumentSection
            title="Specimen Label"
            loading={specimenLabelDocumentsLoading}
            loadingText="Loading specimen label documents..."
            emptyText="No specimen label documents found."
            docs={specimenLabelDocuments}
          />
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
      {detailTab === 'report' && reportLoading && (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      )}
      {detailTab === 'report' && !reportLoading && report && (
        <LabReportContentView
          report={report}
          attachments={reportAttachments}
          resources={reportResources}
          renderLink={renderLink}
        />
      )}
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

type QuestionnaireResponseAnswer = NonNullable<NonNullable<QuestionnaireResponse['item']>[number]['answer']>[number];

/**
 * Extracts the answer value based on FHIR QuestionnaireResponse answer types.
 * @param answer - The answer.
 * @returns The answer text.
 */
function getAnswerText(answer: QuestionnaireResponseAnswer): string {
  if (answer.valueString) {
    return answer.valueString;
  }
  if (answer.valueCoding?.display) {
    return answer.valueCoding.display;
  }
  if (answer.valueCoding?.code) {
    return `${answer.valueCoding.code}${answer.valueCoding.display ? ` - ${answer.valueCoding.display}` : ''}`;
  }
  if (answer.valueBoolean !== undefined) {
    return answer.valueBoolean.toString();
  }
  if (answer.valueInteger !== undefined) {
    return answer.valueInteger.toString();
  }
  if (answer.valueDecimal !== undefined) {
    return answer.valueDecimal.toString();
  }
  if (answer.valueDate) {
    return answer.valueDate;
  }
  if (answer.valueDateTime) {
    return answer.valueDateTime;
  }
  if (answer.valueTime) {
    return answer.valueTime;
  }
  if (answer.valueUri) {
    return answer.valueUri;
  }
  if (answer.valueQuantity) {
    return `${answer.valueQuantity.value}${answer.valueQuantity.unit ? ` ${answer.valueQuantity.unit}` : ''}`;
  }
  if (answer.valueReference?.display) {
    return answer.valueReference.display;
  }
  if (answer.valueReference?.reference) {
    return answer.valueReference.reference;
  }
  if (answer.valueAttachment?.title) {
    return answer.valueAttachment.title;
  }
  if (answer.valueAttachment?.url) {
    return answer.valueAttachment.url;
  }
  return 'No answer provided';
}
