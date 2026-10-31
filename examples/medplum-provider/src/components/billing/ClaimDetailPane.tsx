// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
  Tooltip,
} from '@mantine/core';
import type { MedplumClient, WithId } from '@medplum/core';
import { formatDate, formatDateTime, formatMoney } from '@medplum/core';
import type { Annotation, Claim, ClaimResponse, PaymentReconciliation } from '@medplum/fhirtypes';
import { Loading, ResourceName, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconDots,
  IconExternalLink,
  IconPencil,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CANDID_CLAIM_URL_BOT_IDENTIFIER, CANDID_ENCOUNTER_ID_SYSTEM, isCandidClaimResponse } from '../../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import type { ClaimFollowUp } from './claimActions';
import {
  addClaimNote,
  getClaimFollowUp,
  getClaimNotes,
  refreshClaim,
  setClaimFollowUp,
  submitClaim,
} from './claimActions';
import classes from './ClaimDetailPane.module.css';
import { ClaimFollowUpModal } from './ClaimFollowUpModal';
import { ClaimNoteInput } from './ClaimNoteInput';
import type { ClaimDisplayStatus } from './claimStatus';
import {
  getAdjustmentReasons,
  getClaimDisplayStatus,
  getClaimStatus,
  isRemitResponse,
  sumAdjudicationAmount,
} from './claimStatus';
import { ComingSoon } from './ComingSoon';
import pillTabs from './PillTabs.module.css';

type DetailTab = 'lines' | 'activity';

export interface ClaimDetailPaneProps {
  readonly claimId: string;
  readonly onClose: () => void;
  /** Called after the claim changes, e.g. once submitted, so lists can reload. */
  readonly onChanged: () => void;
}

/**
 * A claim's detail over the worklist: what to do next, its lines with the payer's adjudication and the remittance,
 * then its notes and activity. Key it by `claimId`, so switching claims starts on the first tab.
 * @param props - The ClaimDetailPane React props.
 * @returns The ClaimDetailPane React node.
 */
export function ClaimDetailPane(props: ClaimDetailPaneProps): JSX.Element {
  const { claimId, onClose, onChanged } = props;
  const medplum = useMedplum();
  const [claim, setClaim] = useState<WithId<Claim>>();
  const [responses, setResponses] = useState<WithId<ClaimResponse>[]>();
  const [remittances, setRemittances] = useState<WithId<PaymentReconciliation>[]>();
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<DetailTab>('lines');
  const [notes, setNotes] = useState<Annotation[]>(() => getClaimNotes(claimId));
  const [followUp, setFollowUp] = useState<ClaimFollowUp | undefined>(() => getClaimFollowUp(claimId));
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      medplum.readResource('Claim', claimId, { cache: 'no-cache' }),
      medplum.searchResources(
        'ClaimResponse',
        { request: `Claim/${claimId}`, _sort: '_lastUpdated', _count: '100' },
        { cache: 'no-cache' }
      ),
    ])
      .then(([c, r]) => {
        if (active) {
          setClaim(c);
          setResponses(r);
        }
      })
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, claimId, version]);

  useEffect(() => {
    let active = true;
    findClaimRemittances(medplum, claimId)
      .then((found) => active && setRemittances(found))
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [medplum, claimId, version]);

  const run = useCallback(
    async (action: () => Promise<void>, message: string): Promise<void> => {
      setBusy(true);
      try {
        await action();
        showSuccessNotification({ title: 'Done', message });
        setVersion((v) => v + 1);
        onChanged();
      } catch (err) {
        showErrorNotification(err);
      } finally {
        setBusy(false);
      }
    },
    [onChanged]
  );

  if (!claim || !responses) {
    return (
      <div className={classes.root}>
        <Loading />
      </div>
    );
  }

  const remits = responses.filter(isRemitResponse);
  const response = responses.findLast((r) => !isRemitResponse(r)) ?? remits.at(-1);
  const status = getClaimStatus(claim, responses);
  const editable = status.stage === 'ready' || status.stage === 'rejected';
  const encounterUrl = getEncounterUrl(claim);
  const nextAction = getNextAction({
    claim,
    response,
    status,
    followUp,
    busy,
    encounterUrl,
    onSubmit: () => run(() => submitClaim(medplum, claim), 'Claim submitted to Candid'),
    onRefresh: () => run(() => refreshClaim(medplum, claim), 'Status refreshed from Candid'),
    onFollowUp: () => setFollowUpOpen(true),
  });

  return (
    <div className={classes.root}>
      <Stack className={classes.header} gap="md">
        <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
          <Stack gap={0} className={classes.title}>
            <Text size="xl" fw={800} truncate>
              <ResourceName value={claim.patient} inherit />
            </Text>
            <Text size="sm" c="gray.7" truncate>
              {[getPayerName(responses), getServiceDate(claim)].filter(Boolean).join(' • ')}
            </Text>
          </Stack>
          <Group gap="calc(var(--mantine-spacing-xs) / 2.5)" wrap="nowrap">
            {status.stage !== 'ready' && status.stage !== 'voided' && (
              <Tooltip label="Refresh status" position="bottom" openDelay={500}>
                <ActionIcon
                  variant="transparent"
                  radius="xl"
                  size={32}
                  className="outline-icon-button"
                  aria-label="Refresh status"
                  loading={busy}
                  onClick={() => run(() => refreshClaim(medplum, claim), 'Status refreshed from Candid')}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <ClaimMoreMenu
              claim={claim}
              response={responses.find(isCandidClaimResponse) ?? null}
              editUrl={editable ? encounterUrl : undefined}
              onFollowUp={() => setFollowUpOpen(true)}
            />
            <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="Close" onClick={onClose}>
              <IconX size={16} stroke={2} className={classes.headerIcon} />
            </ActionIcon>
          </Group>
        </Group>
        <Divider />
        <Group justify="space-between" align="center" wrap="nowrap">
          <Tabs
            value={tab}
            onChange={(value) => value && setTab(value as DetailTab)}
            variant="unstyled"
            className={pillTabs.root}
          >
            <Tabs.List>
              <Tabs.Tab value="lines">Lines & Remits</Tabs.Tab>
              <Tabs.Tab value="activity">Notes & Activity</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Button component="div" variant="light" color={status.color} radius="xl" size="sm" title={status.detail}>
            {toTitleCase(status.label)}
          </Button>
        </Group>
        <Divider />
      </Stack>
      <Stack className={classes.body} gap="md">
        {tab === 'lines' && (
          <>
            <section aria-label={nextAction.title}>
              <Stack gap={4}>
                <Text fz="md" fw={800}>
                  Next Steps
                </Text>
                {nextAction.message}
              </Stack>
            </section>
            <Divider className={classes.sectionDivider} />
            <ClaimTotals claim={claim} remits={remits} />
            <Divider className={classes.sectionDivider} />
            <ClaimDiagnoses claim={claim} />
            <Divider className={classes.sectionDivider} />
            <ClaimLines claim={claim} remits={remits} />
            <Divider className={classes.sectionDivider} />
            <RemittanceDetails claimId={claimId} remits={remits} remittances={remittances} />
            <Divider className={classes.sectionDivider} />
            <ClaimIdentifiers claim={claim} />
          </>
        )}
        {tab === 'activity' && <ClaimActivity claim={claim} responses={responses} notes={notes} followUp={followUp} />}
      </Stack>
      {tab === 'lines' && nextAction.actions && (
        <Stack gap="sm" className={classes.footer} role="group" aria-label="Claim actions">
          {nextAction.actions}
        </Stack>
      )}
      {tab === 'activity' && (
        <div className={classes.footer}>
          <ClaimNoteInput autoFocus onAdd={(note) => setNotes(addClaimNote(claimId, note))} />
        </div>
      )}
      <ClaimFollowUpModal
        opened={followUpOpen}
        count={1}
        onClose={() => setFollowUpOpen(false)}
        onSave={(next) => {
          setClaimFollowUp(claimId, next);
          setFollowUp(next);
          setFollowUpOpen(false);
        }}
      />
    </div>
  );
}

function ClaimMoreMenu(props: {
  readonly claim: WithId<Claim>;
  readonly response: WithId<ClaimResponse> | null;
  /** The encounter to edit the claim in, while the claim can still be edited. */
  readonly editUrl?: string;
  readonly onFollowUp: () => void;
}): JSX.Element {
  const { claim, response, editUrl, onFollowUp } = props;
  const medplum = useMedplum();
  const patientRef = claim.patient?.reference;

  const openInCandid = async (): Promise<void> => {
    if (!response) {
      return;
    }
    const bot = await medplum.searchOne('Bot', {
      identifier: `${CANDID_CLAIM_URL_BOT_IDENTIFIER.system}|${CANDID_CLAIM_URL_BOT_IDENTIFIER.value}`,
    });
    if (!bot?.id) {
      throw new Error('The Candid claim link bot is not deployed in this project');
    }
    const result = (await medplum.executeBot(bot.id, response, 'application/fhir+json')) as { url?: string };
    if (result?.url) {
      window.open(result.url, '_blank');
    }
  };

  return (
    <Menu position="bottom-end" shadow="md" width={220}>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="More actions">
          <IconDots size={16} stroke={2} className={classes.headerIcon} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {editUrl && (
          <Menu.Item leftSection={<IconPencil size={16} />} component="a" href={editUrl}>
            Edit claim
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconClock size={16} />} onClick={onFollowUp}>
          Set follow-up
        </Menu.Item>
        <Menu.Item disabled rightSection={<ComingSoon />}>
          Corrected claim
        </Menu.Item>
        <Menu.Item disabled rightSection={<ComingSoon />}>
          Void claim
        </Menu.Item>
        <Menu.Divider />
        {response && isCandidClaimResponse(response) && (
          <Menu.Item
            leftSection={<IconExternalLink size={16} />}
            onClick={() => openInCandid().catch(showErrorNotification)}
          >
            View on Candid
          </Menu.Item>
        )}
        {patientRef && (
          <Menu.Item leftSection={<IconExternalLink size={16} />} component="a" href={`/${patientRef}`}>
            Open patient chart
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface NextActionProps {
  readonly claim: Claim;
  readonly response?: ClaimResponse;
  readonly status: ClaimDisplayStatus;
  readonly followUp?: ClaimFollowUp;
  readonly busy: boolean;
  readonly encounterUrl?: string;
  readonly onSubmit: () => void;
  readonly onRefresh: () => void;
  readonly onFollowUp: () => void;
}

interface NextAction {
  /** What the claim needs, shown at the top of the tab under its status. */
  readonly title: string;
  readonly message: ReactNode;
  /** The buttons for it, pinned under the tab, full width like a modal's actions. */
  readonly actions?: ReactNode;
}

/**
 * What to do with the claim next, given its stage: the message, and the buttons that do it.
 * @param props - The claim, its stage and the action callbacks.
 * @returns The alert and the actions.
 */
function getNextAction(props: NextActionProps): NextAction {
  const { claim, response, status, followUp, busy, encounterUrl, onSubmit, onRefresh, onFollowUp } = props;
  const comingSoon = (...labels: string[]): ReactNode => (
    <Group grow gap="sm">
      {labels.map((label) => (
        <Tooltip label="Coming soon" key={label}>
          <Button variant="default" disabled>
            {label}
          </Button>
        </Tooltip>
      ))}
    </Group>
  );
  const followUpLine = followUp && (
    <Text size="sm">
      <IconClock size={14} style={{ verticalAlign: -2 }} /> Follow up {formatDate(followUp.date)}: {followUp.note}
    </Text>
  );

  switch (status.stage) {
    case 'ready':
      return {
        title: 'Ready to submit',
        message: (
          <Text size="sm">Pre-submit checks aren't stored on claims yet. Review the lines before submitting.</Text>
        ),
        actions: (
          <>
            <Button fullWidth loading={busy} onClick={onSubmit} disabled={!claim.insurance?.length}>
              Submit to Candid
            </Button>
            {encounterUrl && (
              <Button fullWidth variant="default" component="a" href={encounterUrl}>
                Edit claim
              </Button>
            )}
          </>
        ),
      };
    case 'rejected':
      return {
        title: 'Rejected before adjudication',
        message: (
          <Stack gap={4}>
            <Text size="sm">{getResponseMessage(response) ?? 'The clearinghouse or payer rejected this claim.'}</Text>
            <Text size="xs" c="dimmed">
              The payer never processed it, so it isn't a denial. Fix it and resubmit before the filing limit.
            </Text>
          </Stack>
        ),
        actions: (
          <>
            {encounterUrl && (
              <Button fullWidth component="a" href={encounterUrl}>
                Fix claim
              </Button>
            )}
            <Button fullWidth variant="default" loading={busy} onClick={onRefresh}>
              Refresh status
            </Button>
          </>
        ),
      };
    case 'denied':
      return {
        title: 'Denied',
        message: (
          <Stack gap={4}>
            <Text size="sm">{getResponseMessage(response) ?? 'The payer denied this claim.'}</Text>
            {followUpLine}
          </Stack>
        ),
        actions: comingSoon('Appeal', 'Corrected claim', 'Write off'),
      };
    case 'paid-incorrectly':
      return {
        title: 'Paid incorrectly',
        message: <Text size="sm">The payer's allowed amount doesn't match the contracted rate.</Text>,
        actions: comingSoon('Appeal underpayment', 'Accept as paid'),
      };
    case 'paid':
      return {
        title: 'Paid',
        message: <Text size="sm">The payer finalized this claim.</Text>,
      };
    case 'awaiting-remit':
      return {
        title: 'Waiting for the remit',
        message: (
          <Stack gap={4}>
            <Text size="sm">
              {status.detail ? `Clearinghouse status: ${status.detail}. ` : ''}The payment posts when the 835 arrives.
            </Text>
            {followUpLine}
          </Stack>
        ),
        actions: (
          <Group grow gap="sm">
            <Button variant="default" loading={busy} onClick={onRefresh}>
              Refresh status
            </Button>
            <Button variant="default" onClick={onFollowUp}>
              {followUp ? 'Change follow-up' : 'Set follow-up'}
            </Button>
          </Group>
        ),
      };
    case 'voided':
      return {
        title: 'Voided',
        message: <Text size="sm">This claim was cancelled.</Text>,
      };
    default:
      return {
        title: 'With the payer',
        message: (
          <Stack gap={4}>
            <Text size="sm">
              {status.detail ? `Clearinghouse status: ${status.detail}.` : 'Waiting for the payer to adjudicate.'}
            </Text>
            {followUpLine}
          </Stack>
        ),
        actions: (
          <Group grow gap="sm">
            <Button variant="default" loading={busy} onClick={onRefresh}>
              Refresh status
            </Button>
            <Button variant="default" onClick={onFollowUp}>
              {followUp ? 'Change follow-up' : 'Set follow-up'}
            </Button>
          </Group>
        ),
      };
  }
}

/**
 * A titled section of the tab, styled like the SMART Health Link import steps: a heavy subhead with an optional
 * dimmed line under it.
 * @param props - The section props.
 * @param props.title - The subhead.
 * @param props.description - The dimmed line under it.
 * @param props.children - The section content.
 * @returns The section.
 */
function DetailSection(props: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Stack gap="md">
      <div>
        <Text fz="md" fw={800}>
          {props.title}
        </Text>
        {props.description && (
          <Text size="sm" c="dimmed">
            {props.description}
          </Text>
        )}
      </div>
      {props.children}
    </Stack>
  );
}

function MetaItem(props: { readonly label: string; readonly value: ReactNode }): JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={500}>
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </div>
  );
}

function money(value: number | undefined): string {
  return value === undefined ? '—' : formatMoney({ value, currency: 'USD' });
}

function ClaimTotals(props: { readonly claim: Claim; readonly remits: ClaimResponse[] }): JSX.Element {
  const { claim, remits } = props;
  const items = remits.flatMap((r) => r.item ?? []);
  const sum = (...categories: string[]): number | undefined => sumAdjudicationAmount(items, ...categories);
  const payments = remits.map((r) => r.payment?.amount?.value).filter((v) => v !== undefined);
  const paid = payments.length ? payments.reduce((a, b) => a + b, 0) : sum('benefit');
  return (
    <DetailSection title="Claim Totals">
      <div className={classes.metaGrid}>
        <MetaItem label="Billed" value={money(claim.total?.value)} />
        <MetaItem label="Allowed" value={money(sum('eligible'))} />
        <MetaItem label="Paid" value={money(paid)} />
        <MetaItem label="Patient" value={money(sum('deductible', 'copay'))} />
      </div>
    </DetailSection>
  );
}

function ClaimLines(props: { readonly claim: Claim; readonly remits: ClaimResponse[] }): JSX.Element {
  const { claim, remits } = props;
  const lines = claim.item ?? [];
  const remitItems = remits.flatMap((r) => r.item ?? []);
  return (
    <DetailSection
      title="Service Lines"
      description={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, with the payer's adjudication`}
    >
      <Table horizontalSpacing="sm" verticalSpacing="xs" className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Dx</Table.Th>
            <Table.Th>Billed</Table.Th>
            <Table.Th>Allowed</Table.Th>
            <Table.Th>Paid</Table.Th>
            <Table.Th>Adjustments</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lines.map((item) => {
            const coding = item.productOrService?.coding?.[0];
            const adjudicated = remitItems.filter((r) => r.itemSequence === item.sequence);
            const billed = item.net?.value ?? (item.unitPrice?.value ?? 0) * (item.quantity?.value ?? 1);
            return (
              <Table.Tr key={item.sequence}>
                <Table.Td>
                  <Text size="sm">{coding?.code ?? '—'}</Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {coding?.display ?? item.productOrService?.text}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {item.diagnosisSequence?.length ? (
                    <Text size="sm">{item.diagnosisSequence.map(toDiagnosisLetter).join(', ')}</Text>
                  ) : (
                    <Tooltip label="No diagnosis pointer. Payers reject a line without one.">
                      <IconAlertTriangle
                        size={16}
                        color="var(--mantine-color-orange-6)"
                        role="img"
                        aria-label="No diagnosis pointer"
                      />
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{money(billed)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{money(sumAdjudicationAmount(adjudicated, 'eligible'))}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{money(sumAdjudicationAmount(adjudicated, 'benefit'))}</Text>
                </Table.Td>
                <Table.Td>
                  {adjudicated.flatMap(getAdjustmentReasons).map((r, i) => (
                    <Text key={`${r.code}-${i}`} size="xs" ff="monospace">
                      {r.code} {r.amount?.value !== undefined && money(r.amount.value)}
                    </Text>
                  ))}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </DetailSection>
  );
}

function toTitleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDiagnosisLetter(sequence: number): string {
  return String.fromCharCode(64 + sequence);
}

/**
 * The claim's diagnoses, lettered like box 21 of a CMS-1500, so the Dx pointers on the lines below mean something.
 * Flags a diagnosis that no line points to, and a claim with no diagnoses.
 * @param props - The component props.
 * @param props.claim - The claim.
 * @returns The diagnoses section.
 */
function ClaimDiagnoses(props: { readonly claim: Claim }): JSX.Element {
  const diagnoses = props.claim.diagnosis ?? [];
  const pointed = new Set((props.claim.item ?? []).flatMap((item) => item.diagnosisSequence ?? []));
  return (
    <DetailSection
      title="Diagnoses"
      description={diagnoses.length ? undefined : 'No diagnoses on this claim. Payers reject a claim without one.'}
    >
      {diagnoses.length > 0 && (
        <Stack gap={6} aria-label="Diagnoses">
          {diagnoses.map((d) => {
            const coding = d.diagnosisCodeableConcept?.coding?.[0];
            return (
              <Group key={d.sequence} gap="sm" wrap="nowrap" align="baseline">
                <Text size="sm" fw={600} w={16}>
                  {toDiagnosisLetter(d.sequence)}
                </Text>
                <Text size="sm">{coding?.code ?? d.diagnosisReference?.display ?? '—'}</Text>
                <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>
                  {coding?.display ?? d.diagnosisCodeableConcept?.text}
                </Text>
                {!pointed.has(d.sequence) && (
                  <Badge color="orange" variant="light" size="sm" style={{ flexShrink: 0 }}>
                    Not on any line
                  </Badge>
                )}
              </Group>
            );
          })}
        </Stack>
      )}
    </DetailSection>
  );
}

/**
 * The remittances (835s) that pay the claim, each linking to its detail on the Remits tab. Until one is found, the
 * payments on the claim's remit responses stand in.
 * @param props - The component props.
 * @param props.claimId - The claim ID.
 * @param props.remits - The claim's remit responses.
 * @param props.remittances - The PaymentReconciliations that pay the claim, or undefined while loading.
 * @returns The remittance section.
 */
function RemittanceDetails(props: {
  readonly claimId: string;
  readonly remits: ClaimResponse[];
  readonly remittances?: WithId<PaymentReconciliation>[];
}): JSX.Element {
  const { claimId, remits, remittances } = props;
  const payments = remits.map((r) => r.payment).filter((p) => p !== undefined);
  const hasAny = !!remittances?.length || payments.length > 0;
  return (
    <DetailSection
      title="Remittance"
      description={hasAny ? undefined : 'No remittance yet. When the 835 arrives, its payment shows here.'}
    >
      {remittances?.length
        ? remittances.map((remit) => {
            const lines = (remit.detail ?? []).filter((d) => d.request?.reference === `Claim/${claimId}`);
            const amount = lines.reduce((sum, d) => sum + (d.amount?.value ?? 0), 0);
            return (
              <Stack gap="xs" key={remit.id}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={600} truncate>
                    {[remit.paymentIssuer?.display, remit.paymentIdentifier?.value].filter(Boolean).join(' · ') ||
                      'Remittance'}
                  </Text>
                  <Anchor component={Link} to={`/Billing/Remits/all/${remit.id}`} size="sm" style={{ flexShrink: 0 }}>
                    Open remittance <IconArrowRight size={14} style={{ verticalAlign: -2 }} />
                  </Anchor>
                </Group>
                <div className={classes.metaGrid}>
                  <MetaItem label="Paid on This Claim" value={money(amount)} />
                  <MetaItem label="Payment Date" value={remit.paymentDate ? formatDate(remit.paymentDate) : '—'} />
                  <MetaItem label="Payment ID" value={remit.paymentIdentifier?.value ?? '—'} />
                </div>
              </Stack>
            );
          })
        : payments.map((payment, i) => (
            <div className={classes.metaGrid} key={payment.identifier?.value ?? i}>
              <MetaItem label="Amount Paid" value={formatMoney(payment.amount)} />
              <MetaItem label="Payment Date" value={payment.date ? formatDate(payment.date) : '—'} />
              <MetaItem label="Payment ID" value={payment.identifier?.value ?? '—'} />
            </div>
          ))}
    </DetailSection>
  );
}

/**
 * Finds the remittances that pay a claim. A remittance names its claims only in `detail.request`, which has no search
 * parameter, so this reads the most recent remittances and keeps the ones that name the claim.
 * @param medplum - The Medplum client.
 * @param claimId - The claim ID.
 * @returns The claim's remittances, newest first.
 */
async function findClaimRemittances(medplum: MedplumClient, claimId: string): Promise<WithId<PaymentReconciliation>[]> {
  const recent = await medplum.searchResources(
    'PaymentReconciliation',
    { _sort: '-created', _count: '200' },
    { cache: 'no-cache' }
  );
  return recent.filter((r) => r.detail?.some((d) => d.request?.reference === `Claim/${claimId}`));
}

const IDENTIFIER_LABELS: Record<string, string> = {
  [CANDID_ENCOUNTER_ID_SYSTEM]: 'Candid Encounter ID',
  'https://www.stedi.com/claims': 'Stedi Claim ID',
  'https://www.stedi.com/claim-submissions': 'Stedi Submission ID',
};

/**
 * The IDs to quote when calling the clearinghouse or payer: the PCN, the clearinghouse's own IDs and the Medplum ID.
 * @param props - The component props.
 * @param props.claim - The claim.
 * @returns The identifiers section.
 */
function ClaimIdentifiers(props: { readonly claim: WithId<Claim> }): JSX.Element {
  const { claim } = props;
  const pcn = getClaimNumber(claim);
  const others = (claim.identifier ?? []).filter((id) => id.value && !isPatientControlNumber(id.system));
  return (
    <DetailSection title="Identifiers">
      <div className={classes.metaGrid}>
        <MetaItem label="PCN" value={pcn ?? '—'} />
        {others.map((id) => (
          <MetaItem
            key={`${id.system}|${id.value}`}
            label={IDENTIFIER_LABELS[id.system ?? ''] ?? 'Identifier'}
            value={id.value}
          />
        ))}
        <MetaItem label="Medplum ID" value={claim.id} />
      </div>
    </DetailSection>
  );
}

interface ActivityEvent {
  readonly title: string;
  readonly time?: string;
  readonly color?: string;
  /** Shown under the title, e.g. a note's text. */
  readonly body?: string;
}

function ClaimActivity(props: {
  readonly claim: Claim;
  readonly responses: ClaimResponse[];
  readonly notes: Annotation[];
  readonly followUp?: ClaimFollowUp;
}): JSX.Element {
  const { claim, responses, notes, followUp } = props;
  const events: ActivityEvent[] = [];
  events.push({ title: 'Claim created', time: claim.created });
  const tracker = responses.findLast((r) => !isRemitResponse(r));
  if (responses.length) {
    events.push({ title: 'Submitted to the clearinghouse', time: responses[0].created, color: 'violet' });
  }
  if (tracker) {
    const status = getClaimDisplayStatus(claim, tracker);
    events.push({
      title: `Status: ${status.detail ?? status.label}`,
      time: tracker.meta?.lastUpdated,
      color: status.color,
    });
  }
  responses.filter(isRemitResponse).forEach((r) =>
    events.push({
      title: r.payment?.amount ? `Remittance: ${formatMoney(r.payment.amount)} paid` : 'Remittance posted',
      time: r.payment?.date ?? r.created,
      color: 'green',
    })
  );
  notes.forEach((n) =>
    events.push({ title: `Note from ${n.authorString}`, time: n.time, color: 'grape', body: n.text })
  );
  events.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
  if (followUp) {
    events.unshift({ title: `Follow-up set for ${formatDate(followUp.date)}`, color: 'grape', body: followUp.note });
  }
  return (
    <Timeline
      bulletSize={14}
      lineWidth={1}
      active={events.length}
      mt="calc(var(--mantine-spacing-xl) - var(--mantine-spacing-md))"
      styles={{ itemTitle: { marginBottom: 'calc(var(--mantine-spacing-xs) / 2.5)' } }}
    >
      {events.map((e, i) => (
        <Timeline.Item
          key={`${e.title}-${i}`}
          title={e.title}
          color={e.color ?? 'gray'}
          bullet={<IconCheck size={8} />}
        >
          {e.time && (
            <Text size="xs" c="dimmed">
              {formatActivityTime(e.time)}
            </Text>
          )}
          {e.body && (
            <Text size="sm" mt={6} className={classes.noteText}>
              {e.body}
            </Text>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

/**
 * Formats an activity time like `4/12/2026 · 3:05 PM`: the date and time without seconds.
 * @param time - The FHIR dateTime.
 * @returns The formatted time.
 */
function formatActivityTime(time: string): string {
  const date = formatDateTime(time, undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
  return `${date} · ${formatDateTime(time, undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function getEncounterUrl(claim: Claim): string | undefined {
  const encounter = claim.item?.[0]?.encounter?.[0]?.reference;
  const patient = claim.patient?.reference;
  return encounter && patient ? `/${patient}/${encounter}` : undefined;
}

function getServiceDate(claim: Claim): string | undefined {
  const date = claim.billablePeriod?.start ?? claim.item?.[0]?.servicedDate ?? claim.created;
  return date ? `DOS ${formatDate(date)}` : undefined;
}

function getPayerName(responses: ClaimResponse[]): string | undefined {
  return responses.findLast((r) => r.insurer?.display)?.insurer?.display;
}

function isPatientControlNumber(system: string | undefined): boolean {
  return !!system?.endsWith('patient-control-number');
}

/**
 * The patient control number (PCN): the claim's own number, which the clearinghouse and payer send back.
 * @param claim - The claim.
 * @returns The PCN, if the claim has one.
 */
function getClaimNumber(claim: Claim): string | undefined {
  return claim.identifier?.find((id) => isPatientControlNumber(id.system))?.value;
}

function getResponseMessage(response: ClaimResponse | undefined): string | undefined {
  return response?.disposition ?? response?.processNote?.[0]?.text ?? response?.error?.[0]?.code?.text;
}
