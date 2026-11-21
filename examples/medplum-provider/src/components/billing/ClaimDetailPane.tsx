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
import type { WithId } from '@medplum/core';
import { formatDate, formatDateTime, formatMoney } from '@medplum/core';
import type { Annotation, Claim, ClaimResponse, PaymentReconciliation } from '@medplum/fhirtypes';
import { Loading, ResourceName, useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBan,
  IconCheck,
  IconClock,
  IconDots,
  IconExternalLink,
  IconFileDiff,
  IconRefresh,
  IconTrash,
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
  markPatientBalanceCollected,
  refreshClaim,
  setClaimFollowUp,
  submitClaim,
} from './claimActions';
import { getClaimEncounter } from './claimConditions';
import classes from './ClaimDetailPane.module.css';
import { getLineCharge } from './claimEditing';
import { ClaimDiagnosesEditor, ClaimLinesEditor, ClaimVisitDetails } from './ClaimEditor';
import { ClaimFollowUpModal } from './ClaimFollowUpModal';
import { ClaimInsurance } from './ClaimInsurance';
import { getClaimIssues, getPatientResponsibility } from './claimIssues';
import { ClaimNoteInput } from './ClaimNoteInput';
import type { ClaimDisplayStatus } from './claimStatus';
import {
  getAdjustmentReasons,
  getClaimDisplayStatus,
  getClaimStatus,
  isClaimEditable,
  isRemitResponse,
  sumAdjudicationAmount,
} from './claimStatus';
import { DetailSection, MetaItem } from './DetailSection';
import { canDiscardClaim } from './discardClaim';
import { DiscardClaimModal } from './DiscardClaimModal';
import pillTabs from './PillTabs.module.css';
import type { ClaimIssue } from './preSubmitChecks';
import { RelatedClaims } from './RelatedClaims';
import { useClaimAutosave } from './useClaimAutosave';
import { findClaimRemittances } from './visitDetails';

type DetailTab = 'overview' | 'lines' | 'insurance' | 'activity';

export interface ClaimDetailPaneProps {
  readonly claimId: string;
  readonly onClose: () => void;
  /** Called after the claim changes, e.g. once submitted, so lists can reload. */
  readonly onChanged: () => void;
  /** Opens a related claim in place of this one; without it, related claims link to Billing. */
  readonly onOpenClaim?: (id: string) => void;
  /** Whether the pane opens over the claim's own visit, so it needn't link to it. */
  readonly onVisit?: boolean;
}

/**
 * A claim's detail over the worklist: what to do next, its lines with the payer's adjudication and the remittance,
 * then its notes and activity. Key it by `claimId`, so switching claims starts on the first tab.
 * @param props - The ClaimDetailPane React props.
 * @returns The ClaimDetailPane React node.
 */
export function ClaimDetailPane(props: ClaimDetailPaneProps): JSX.Element {
  const { claimId, onClose, onChanged, onOpenClaim, onVisit } = props;
  const medplum = useMedplum();
  const [claim, setClaim] = useState<WithId<Claim>>();
  const [responses, setResponses] = useState<WithId<ClaimResponse>[]>();
  const [remittances, setRemittances] = useState<WithId<PaymentReconciliation>[]>();
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [notes, setNotes] = useState<Annotation[]>(() => getClaimNotes(claimId));
  const [followUp, setFollowUp] = useState<ClaimFollowUp | undefined>(() => getClaimFollowUp(claimId));
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const autosave = useClaimAutosave(onChanged);

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
    findClaimRemittances(medplum, [claimId])
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
  const editable = isClaimEditable(claim, responses);
  const encounterUrl = getEncounterUrl(claim);
  const editClaim = (next: Claim): void => {
    const edited = { ...next, id: claim.id };
    setClaim(edited);
    autosave.queue(edited);
  };

  const nextAction = getNextAction({
    response,
    status,
    issues: getClaimIssues(claim, responses),
    followUp,
    busy,
    onSubmit: () =>
      run(async () => {
        await autosave.flush();
        await submitClaim(medplum, claim);
      }, 'Claim submitted to Candid'),
    onRefresh: () => run(() => refreshClaim(medplum, claim), 'Status refreshed from Candid'),
    onFollowUp: () => setFollowUpOpen(true),
    onCollected: () => {
      markPatientBalanceCollected(claim.id);
      setVersion((v) => v + 1);
      onChanged();
    },
  });

  return (
    <div className={classes.root}>
      <Stack className={classes.header} gap="md">
        <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
          <Stack gap={0} className={classes.title}>
            <Text size="xl" fw={800} truncate>
              <ResourceName value={claim.patient} inherit />
            </Text>
            <Text size="sm" c="gray.7" truncate>
              {[getPayerName(responses), getServiceDate(claim)].filter(Boolean).join(' • ')}
            </Text>
          </Stack>
          <Group gap="xs" wrap="nowrap">
            {status.stage !== 'ready' && status.stage !== 'needs-fixing' && status.stage !== 'voided' && (
              <Tooltip label="Refresh Status" position="bottom" openDelay={500}>
                <ActionIcon
                  variant="transparent"
                  radius="xl"
                  size={32}
                  className="outline-icon-button"
                  aria-label="Refresh Status"
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
              encounterUrl={onVisit ? undefined : encounterUrl}
              showPatientLink={!onVisit}
              onFollowUp={() => setFollowUpOpen(true)}
              onDiscard={canDiscardClaim(claim, responses) ? () => setDiscarding(true) : undefined}
            />
            <ActionIcon
              variant="transparent"
              radius="xl"
              size={32}
              className="outline-icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <IconX size={16} />
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
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="lines">Lines & Details</Tabs.Tab>
              <Tabs.Tab value="insurance">Insurance</Tabs.Tab>
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
        {tab === 'overview' && (
          <>
            <ClaimTotals claim={claim} remits={remits}>
              <RemittanceDetails claimId={claimId} remits={remits} remittances={remittances} />
            </ClaimTotals>
            <DetailSection title="Next Steps" label={nextAction.title}>
              {nextAction.message}
            </DetailSection>
            <RelatedClaims claim={claim} onOpenClaim={onOpenClaim} />
            <ClaimIdentifiers claim={claim} />
          </>
        )}
        {tab === 'lines' && (
          <>
            <ClaimVisitDetails claim={claim} showVisitLink={!onVisit} />
            {editable ? (
              <>
                <ClaimDiagnosesEditor claim={claim} onChange={editClaim} />
                <ClaimLinesEditor claim={claim} onChange={editClaim} />
              </>
            ) : (
              <>
                <ClaimDiagnoses claim={claim} />
                <ClaimLines claim={claim} remits={remits} />
              </>
            )}
          </>
        )}
        {tab === 'insurance' && <ClaimInsurance claim={claim} />}
        {tab === 'activity' && <ClaimActivity claim={claim} responses={responses} notes={notes} followUp={followUp} />}
      </Stack>
      {(tab === 'overview' || tab === 'lines') && nextAction.actions && (
        <Stack gap="sm" className={classes.footer} role="group" aria-label="Claim actions">
          {nextAction.actions}
        </Stack>
      )}
      {tab === 'activity' && (
        <div className={classes.footer}>
          <ClaimNoteInput autoFocus onAdd={(note) => setNotes(addClaimNote(claimId, note))} />
        </div>
      )}
      <DiscardClaimModal
        claim={discarding ? claim : undefined}
        onClose={() => setDiscarding(false)}
        onDiscarded={() => {
          onChanged();
          onClose();
        }}
      />
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
  readonly encounterUrl?: string;
  /** Whether to link to the patient's chart; off when the claim is already open over it. */
  readonly showPatientLink?: boolean;
  readonly onFollowUp: () => void;
  /** Discards the claim; offered only for a claim that can be discarded. */
  readonly onDiscard?: () => void;
}): JSX.Element {
  const { claim, response, encounterUrl, showPatientLink = true, onFollowUp, onDiscard } = props;
  const medplum = useMedplum();
  const patientRef = showPatientLink ? claim.patient?.reference : undefined;
  const candidLink = !!response && isCandidClaimResponse(response);

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
    <Menu position="bottom-end" shadow="md" width={220} radius="md">
      <Menu.Target>
        <ActionIcon
          variant="transparent"
          radius="xl"
          size={32}
          className="outline-icon-button"
          aria-label="More actions"
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconClock size={16} color="var(--mantine-color-dimmed)" />} onClick={onFollowUp}>
          <Text size="sm">Set Follow-Up</Text>
        </Menu.Item>
        <Menu.Item disabled leftSection={<IconFileDiff size={16} color="var(--mantine-color-dimmed)" />}>
          <Text size="sm">Corrected Claim</Text>
        </Menu.Item>
        <Menu.Item disabled leftSection={<IconBan size={16} color="var(--mantine-color-dimmed)" />}>
          <Text size="sm">Void Claim</Text>
        </Menu.Item>
        {onDiscard && (
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDiscard}>
            <Text size="sm">Discard Claim</Text>
          </Menu.Item>
        )}
        {(candidLink || encounterUrl || patientRef) && <Menu.Divider />}
        {candidLink && (
          <Menu.Item
            leftSection={<IconExternalLink size={16} color="var(--mantine-color-dimmed)" />}
            onClick={() => openInCandid().catch(showErrorNotification)}
          >
            <Text size="sm">View on Candid</Text>
          </Menu.Item>
        )}
        {encounterUrl && (
          <Menu.Item
            leftSection={<IconExternalLink size={16} color="var(--mantine-color-dimmed)" />}
            component="a"
            href={encounterUrl}
          >
            <Text size="sm">Open Encounter</Text>
          </Menu.Item>
        )}
        {patientRef && (
          <Menu.Item
            leftSection={<IconExternalLink size={16} color="var(--mantine-color-dimmed)" />}
            component="a"
            href={`/${patientRef}`}
          >
            <Text size="sm">Open Patient Chart</Text>
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface NextActionProps {
  readonly response?: ClaimResponse;
  readonly status: ClaimDisplayStatus;
  /** What needs attention on the claim, the same reasons All Issues shows. */
  readonly issues: ClaimIssue[];
  readonly followUp?: ClaimFollowUp;
  readonly busy: boolean;
  readonly onSubmit: () => void;
  readonly onRefresh: () => void;
  readonly onFollowUp: () => void;
  readonly onCollected: () => void;
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
  const { response, status, issues, followUp, busy, onSubmit, onRefresh, onFollowUp, onCollected } = props;
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
  const balance = issues.find((i) => i.code === 'patient-balance');
  const balanceLine = balance && <Text size="sm">{balance.detail}</Text>;

  switch (status.stage) {
    case 'needs-fixing':
      return {
        title: 'Needs fixing',
        message: (
          <Stack gap={4}>
            {issues.map((issue) => (
              <Text size="sm" key={issue.code}>
                <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" style={{ verticalAlign: -2 }} />{' '}
                {issue.detail}
              </Text>
            ))}
          </Stack>
        ),
        actions: (
          <Button fullWidth disabled>
            Submit to Candid
          </Button>
        ),
      };
    case 'ready':
      return {
        title: 'Ready to submit',
        message: (
          <Text size="sm">Coverage, diagnoses and pointers are in place. Review the lines before submitting.</Text>
        ),
        actions: (
          <>
            <Button fullWidth loading={busy} onClick={onSubmit}>
              Submit to Candid
            </Button>
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
            <Button fullWidth variant="default" loading={busy} onClick={onRefresh}>
              Refresh Status
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
            {balanceLine}
            {followUpLine}
          </Stack>
        ),
        actions: comingSoon('Appeal', 'Corrected Claim', 'Write Off'),
      };
    case 'paid-incorrectly':
      return {
        title: 'Paid incorrectly',
        message: (
          <Stack gap={4}>
            <Text size="sm">The payer's allowed amount doesn't match the contracted rate.</Text>
            {balanceLine}
          </Stack>
        ),
        actions: comingSoon('Appeal underpayment', 'Accept as paid'),
      };
    case 'paid':
      if (balance) {
        return {
          title: 'Patient balance',
          message: <Text size="sm">The payer finalized this claim. {balance.detail}</Text>,
          actions: (
            <>
              <Button fullWidth onClick={onCollected}>
                Mark collected
              </Button>
              {comingSoon('Send statement')}
            </>
          ),
        };
      }
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
              Refresh Status
            </Button>
            <Button variant="default" onClick={onFollowUp}>
              {followUp ? 'Change Follow-Up' : 'Set Follow-Up'}
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
            {balanceLine}
            {followUpLine}
          </Stack>
        ),
        actions: (
          <Group grow gap="sm">
            <Button variant="default" loading={busy} onClick={onRefresh}>
              Refresh Status
            </Button>
            <Button variant="default" onClick={onFollowUp}>
              {followUp ? 'Change Follow-Up' : 'Set Follow-Up'}
            </Button>
          </Group>
        ),
      };
  }
}

function money(value: number | undefined): string {
  return value === undefined ? '—' : formatMoney({ value, currency: 'USD' });
}

function ClaimTotals(props: {
  readonly claim: Claim;
  readonly remits: ClaimResponse[];
  readonly children?: ReactNode;
}): JSX.Element {
  const { claim, remits } = props;
  const items = remits.flatMap((r) => r.item ?? []);
  const sum = (...categories: string[]): number | undefined => sumAdjudicationAmount(items, ...categories);
  const payments = remits.map((r) => r.payment?.amount?.value).filter((v) => v !== undefined);
  const paid = payments.length ? payments.reduce((a, b) => a + b, 0) : sum('benefit');
  return (
    <DetailSection title="Totals">
      <div className={classes.metaGrid}>
        <MetaItem label="Billed" value={money(claim.total?.value)} />
        <MetaItem label="Allowed" value={money(sum('eligible'))} />
        <MetaItem label="Paid" value={money(paid)} />
        <MetaItem label="Patient" value={money(getPatientResponsibility(remits))} />
      </div>
      {props.children}
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
            const billed = getLineCharge(item);
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
        <Stack gap={6}>
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
    <Stack gap="sm" component="section" aria-label="Remittance" className={classes.subsection}>
      <div>
        <Text size="sm" fw={700}>
          Remittance
        </Text>
        {!hasAny && (
          <Text size="sm" c="dimmed">
            No remittance yet. When the 835 arrives, its payment shows here.
          </Text>
        )}
      </div>
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
    </Stack>
  );
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
    <section aria-label="Identifiers" className={`${classes.metaGrid} ${classes.subsection} ${classes.pinnedBottom}`}>
      <MetaItem label="Medplum ID" value={claim.id} />
      {others.map((id) => (
        <MetaItem
          key={`${id.system}|${id.value}`}
          label={IDENTIFIER_LABELS[id.system ?? ''] ?? 'Identifier'}
          value={id.value}
        />
      ))}
      <MetaItem label="PCN" value={pcn ?? '—'} />
    </section>
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
  const encounter = getClaimEncounter(claim)?.reference;
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
