// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Timeline,
  Tooltip,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, formatDateTime, formatMoney, getDisplayString, getReferenceString } from '@medplum/core';
import type { Annotation, Claim, ClaimResponse, Coverage, Reference } from '@medplum/fhirtypes';
import { Loading, ResourceName, useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconDots,
  IconExternalLink,
  IconInfoCircle,
  IconPencil,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CANDID_CLAIM_URL_BOT_IDENTIFIER, isCandidClaimResponse } from '../../utils/candid';
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
import type { ClaimDisplayStatus } from './claimStatus';
import { getAdjudicationAmount, getAdjustmentReasons, getClaimDisplayStatus } from './claimStatus';
import { ComingSoon } from './ComingSoon';

type DetailTab = 'lines' | 'notes' | 'activity' | 'patient';

export interface ClaimDetailPaneProps {
  readonly claimId: string;
  readonly onClose: () => void;
  /** Called after the claim changes, e.g. once submitted, so lists can reload. */
  readonly onChanged: () => void;
}

/**
 * A claim's detail beside the worklist: what to do next, its lines with the payer's adjudication, notes, activity,
 * and the patient's coverage. Key it by `claimId`, so switching claims starts on the first tab.
 * @param props - The ClaimDetailPane React props.
 * @returns The ClaimDetailPane React node.
 */
export function ClaimDetailPane(props: ClaimDetailPaneProps): JSX.Element {
  const { claimId, onClose, onChanged } = props;
  const medplum = useMedplum();
  const [claim, setClaim] = useState<WithId<Claim>>();
  const [response, setResponse] = useState<WithId<ClaimResponse> | null>();
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
      medplum.searchOne(
        'ClaimResponse',
        { request: `Claim/${claimId}`, _sort: '-_lastUpdated' },
        { cache: 'no-cache' }
      ),
    ])
      .then(([c, r]) => {
        if (active) {
          setClaim(c);
          setResponse(r ?? null);
        }
      })
      .catch(showErrorNotification);
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

  if (!claim || response === undefined) {
    return (
      <div className={classes.root}>
        <Loading />
      </div>
    );
  }

  const status = getClaimDisplayStatus(claim, response ?? undefined);
  const editable = status.stage === 'ready' || status.stage === 'rejected';
  const encounterUrl = getEncounterUrl(claim);

  return (
    <div className={classes.root}>
      <Group className={classes.header} justify="space-between" wrap="nowrap" gap="sm">
        <div className={classes.title}>
          <Text fw={800} size="lg" truncate>
            <ResourceName value={claim.patient} />
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {[claimId.slice(0, 8), getPayerName(response), getServiceDate(claim)].filter(Boolean).join(' · ')}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Badge color={status.color} variant="light">
            {status.label}
          </Badge>
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
          {editable && encounterUrl && (
            <Tooltip label="Edit claim" position="bottom" openDelay={500}>
              <ActionIcon
                component="a"
                href={encounterUrl}
                variant="transparent"
                radius="xl"
                size={32}
                className="outline-icon-button"
                aria-label="Edit claim"
              >
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <ClaimMoreMenu claim={claim} response={response} onFollowUp={() => setFollowUpOpen(true)} />
          <ActionIcon variant="subtle" color="gray" radius="xl" size={32} aria-label="Close" onClick={onClose}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Group>
      <Divider />
      <Stack className={classes.body} gap="md">
        <SegmentedControl
          fullWidth
          radius="md"
          value={tab}
          onChange={(value) => setTab(value as DetailTab)}
          data={[
            { value: 'lines', label: 'Lines & remittance' },
            { value: 'notes', label: notes.length ? `Notes (${notes.length})` : 'Notes' },
            { value: 'activity', label: 'Activity' },
            { value: 'patient', label: 'Patient' },
          ]}
        />
        {tab === 'lines' && (
          <>
            <NextAction
              claim={claim}
              response={response ?? undefined}
              status={status}
              followUp={followUp}
              busy={busy}
              encounterUrl={encounterUrl}
              onSubmit={() => run(() => submitClaim(medplum, claim), 'Claim submitted to Candid')}
              onRefresh={() => run(() => refreshClaim(medplum, claim), 'Status refreshed from Candid')}
              onFollowUp={() => setFollowUpOpen(true)}
            />
            <ClaimTotals claim={claim} response={response ?? undefined} />
            <ClaimLines claim={claim} response={response ?? undefined} />
            <RemittanceCard response={response ?? undefined} />
          </>
        )}
        {tab === 'notes' && <ClaimNotes notes={notes} onAdd={(note) => setNotes(addClaimNote(claimId, note))} />}
        {tab === 'activity' && (
          <ClaimActivity claim={claim} response={response ?? undefined} notes={notes} followUp={followUp} />
        )}
        {tab === 'patient' && <ClaimPatient claim={claim} />}
      </Stack>
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
  readonly onFollowUp: () => void;
}): JSX.Element {
  const { claim, response, onFollowUp } = props;
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

/**
 * What to do with the claim next, given its stage.
 * @param props - The NextAction React props.
 * @returns The NextAction React node.
 */
function NextAction(props: NextActionProps): JSX.Element {
  const { claim, response, status, followUp, busy, encounterUrl, onSubmit, onRefresh, onFollowUp } = props;
  const disabledAction = (label: string): ReactNode => (
    <Tooltip label="Coming soon" key={label}>
      <Button size="xs" variant="default" disabled>
        {label}
      </Button>
    </Tooltip>
  );
  const followUpLine = followUp && (
    <Text size="sm">
      <IconClock size={14} style={{ verticalAlign: -2 }} /> Follow up {formatDate(followUp.date)}: {followUp.note}
    </Text>
  );

  switch (status.stage) {
    case 'ready':
      return (
        <Alert color="blue" icon={<IconInfoCircle />} title="Ready to submit">
          <Stack gap="xs">
            <Text size="sm">Pre-submit checks aren't stored on claims yet. Review the lines before submitting.</Text>
            <Group gap="xs">
              <Button size="xs" loading={busy} onClick={onSubmit} disabled={!claim.insurance?.length}>
                Submit to Candid
              </Button>
              {encounterUrl && (
                <Button size="xs" variant="default" component="a" href={encounterUrl}>
                  Edit claim
                </Button>
              )}
            </Group>
          </Stack>
        </Alert>
      );
    case 'rejected':
      return (
        <Alert color="red" icon={<IconAlertTriangle />} title="Rejected before adjudication">
          <Stack gap="xs">
            <Text size="sm">{getResponseMessage(response) ?? 'The clearinghouse or payer rejected this claim.'}</Text>
            <Text size="xs" c="dimmed">
              The payer never processed it, so it isn't a denial. Fix it and resubmit before the filing limit.
            </Text>
            <Group gap="xs">
              {encounterUrl && (
                <Button size="xs" component="a" href={encounterUrl}>
                  Fix claim
                </Button>
              )}
              <Button size="xs" variant="default" loading={busy} onClick={onRefresh}>
                Refresh status
              </Button>
            </Group>
          </Stack>
        </Alert>
      );
    case 'denied':
      return (
        <Alert color="red" icon={<IconAlertTriangle />} title="Denied">
          <Stack gap="xs">
            <Text size="sm">{getResponseMessage(response) ?? 'The payer denied this claim.'}</Text>
            {followUpLine}
            <Group gap="xs">
              {disabledAction('Appeal')}
              {disabledAction('Corrected claim')}
              {disabledAction('Write off')}
            </Group>
          </Stack>
        </Alert>
      );
    case 'paid-incorrectly':
      return (
        <Alert color="yellow" icon={<IconAlertTriangle />} title="Paid incorrectly">
          <Stack gap="xs">
            <Text size="sm">The payer's allowed amount doesn't match the contracted rate.</Text>
            <Group gap="xs">
              {disabledAction('Appeal underpayment')}
              {disabledAction('Accept as paid')}
            </Group>
          </Stack>
        </Alert>
      );
    case 'paid':
      return (
        <Alert color="green" icon={<IconCircleCheck />} title="Paid">
          <Text size="sm">The payer finalized this claim.</Text>
        </Alert>
      );
    case 'voided':
      return (
        <Alert color="gray" icon={<IconInfoCircle />} title="Voided">
          <Text size="sm">This claim was cancelled.</Text>
        </Alert>
      );
    default:
      return (
        <Alert color="violet" icon={<IconInfoCircle />} title="With the payer">
          <Stack gap="xs">
            <Text size="sm">
              {status.detail ? `Clearinghouse status: ${status.detail}.` : 'Waiting for the payer to adjudicate.'}
            </Text>
            {followUpLine}
            <Group gap="xs">
              <Button size="xs" variant="default" loading={busy} onClick={onRefresh}>
                Refresh status
              </Button>
              <Button size="xs" variant="default" onClick={onFollowUp}>
                {followUp ? 'Change follow-up' : 'Set follow-up'}
              </Button>
            </Group>
          </Stack>
        </Alert>
      );
  }
}

function ClaimTotals(props: { readonly claim: Claim; readonly response?: ClaimResponse }): JSX.Element {
  const { claim, response } = props;
  const items = response?.item ?? [];
  const sum = (...categories: string[]): number | undefined => {
    const values = items.map((i) => getAdjudicationAmount(i, ...categories)).filter((v) => v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  const paid = response?.payment?.amount?.value ?? sum('benefit');
  const stats: [string, number | undefined][] = [
    ['Billed', claim.total?.value],
    ['Allowed', sum('eligible')],
    ['Paid', paid],
    ['Patient', sum('deductible', 'copay')],
  ];
  return (
    <SimpleGrid cols={4} spacing={0} className={classes.stats}>
      {stats.map(([label, value]) => (
        <div key={label} className={classes.stat}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text fw={700}>{value === undefined ? '—' : formatMoney({ value, currency: 'USD' })}</Text>
        </div>
      ))}
    </SimpleGrid>
  );
}

function ClaimLines(props: { readonly claim: Claim; readonly response?: ClaimResponse }): JSX.Element {
  const { claim, response } = props;
  const money = (value: number | undefined): string =>
    value === undefined ? '—' : formatMoney({ value, currency: 'USD' });
  return (
    <Table fz="xs" verticalSpacing={6}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Code</Table.Th>
          <Table.Th>Dx</Table.Th>
          <Table.Th ta="right">Billed</Table.Th>
          <Table.Th ta="right">Allowed</Table.Th>
          <Table.Th ta="right">Paid</Table.Th>
          <Table.Th>Adjustments</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {(claim.item ?? []).map((item) => {
          const coding = item.productOrService?.coding?.[0];
          const adjudicated = response?.item?.find((r) => r.itemSequence === item.sequence);
          const billed = item.net?.value ?? (item.unitPrice?.value ?? 0) * (item.quantity?.value ?? 1);
          return (
            <Table.Tr key={item.sequence}>
              <Table.Td>
                <Text size="xs" fw={700}>
                  {coding?.code ?? '—'}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {coding?.display ?? item.productOrService?.text}
                </Text>
              </Table.Td>
              <Table.Td>{(item.diagnosisSequence ?? []).map((n) => String.fromCharCode(64 + n)).join(', ')}</Table.Td>
              <Table.Td ta="right">{money(billed)}</Table.Td>
              <Table.Td ta="right">{money(getAdjudicationAmount(adjudicated, 'eligible'))}</Table.Td>
              <Table.Td ta="right">{money(getAdjudicationAmount(adjudicated, 'benefit'))}</Table.Td>
              <Table.Td>
                {getAdjustmentReasons(adjudicated).map((r) => (
                  <Text key={r.code} size="xs" ff="monospace">
                    {r.code} {r.amount?.value !== undefined && money(r.amount.value)}
                  </Text>
                ))}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function RemittanceCard(props: { readonly response?: ClaimResponse }): JSX.Element {
  const payment = props.response?.payment;
  return (
    <Stack gap={4} className={classes.card}>
      <Text fw={700} size="sm">
        Remittance
      </Text>
      {payment ? (
        <Text size="sm">
          {formatMoney(payment.amount)} paid {payment.date ? `on ${formatDate(payment.date)}` : ''}
          {payment.identifier?.value ? ` · ${payment.identifier.value}` : ''}
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          No remittance yet. When the 835 arrives, its payment shows here.
        </Text>
      )}
    </Stack>
  );
}

function ClaimNotes(props: { readonly notes: Annotation[]; readonly onAdd: (note: Annotation) => void }): JSX.Element {
  const { notes, onAdd } = props;
  const profile = useMedplumProfile();
  const [text, setText] = useState('');
  return (
    <Stack gap={0}>
      <Text size="lg" fw={600} mb="xs">
        Notes
      </Text>
      {notes.length === 0 && (
        <Text size="sm" c="dimmed" mb="sm">
          No notes yet. Anyone on the team can add one: call reference numbers, what was tried, what's next.
        </Text>
      )}
      {notes.map((note, i) => (
        <Stack key={`${note.time}-${i}`} gap={4} py="sm" className={classes.note}>
          <Group gap="xs">
            <Text size="sm" fw={500}>
              {note.authorString}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDateTime(note.time)}
            </Text>
          </Group>
          <Text size="sm">{note.text}</Text>
        </Stack>
      ))}
      <Stack gap="xs" mt="sm">
        <Textarea
          placeholder="Add a note..."
          minRows={3}
          autosize
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Notes aren't saved yet. They last until the page reloads.
          </Text>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              onAdd({
                text: text.trim(),
                time: new Date().toISOString(),
                authorString: profile ? getDisplayString(profile) : 'You',
              });
              setText('');
            }}
          >
            Submit
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}

function ClaimActivity(props: {
  readonly claim: Claim;
  readonly response?: ClaimResponse;
  readonly notes: Annotation[];
  readonly followUp?: ClaimFollowUp;
}): JSX.Element {
  const { claim, response, notes, followUp } = props;
  const events: { title: string; time?: string; color?: string }[] = [];
  events.push({ title: 'Claim created', time: claim.created });
  if (response) {
    events.push({ title: 'Submitted to the clearinghouse', time: response.created, color: 'violet' });
    const status = getClaimDisplayStatus(claim, response);
    events.push({
      title: `Status: ${status.detail ?? status.label}`,
      time: response.meta?.lastUpdated,
      color: status.color,
    });
  }
  notes.forEach((n) => events.push({ title: `Note from ${n.authorString}`, time: n.time, color: 'grape' }));
  if (followUp) {
    events.push({ title: `Follow-up set for ${formatDate(followUp.date)}`, color: 'grape' });
  }
  return (
    <Timeline bulletSize={14} lineWidth={1} active={events.length}>
      {events.map((e, i) => (
        <Timeline.Item
          key={`${e.title}-${i}`}
          title={e.title}
          color={e.color ?? 'gray'}
          bullet={<IconCheck size={8} />}
        >
          {e.time && (
            <Text size="xs" c="dimmed">
              {formatDateTime(e.time)}
            </Text>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

function ClaimPatient(props: { readonly claim: Claim }): JSX.Element {
  const { claim } = props;
  return (
    <Stack gap="sm">
      {(claim.insurance ?? []).map((insurance) => (
        <CoverageCard key={insurance.sequence} coverage={insurance.coverage} focal={insurance.focal} />
      ))}
      {!claim.insurance?.length && (
        <Text size="sm" c="dimmed">
          No coverage on this claim.
        </Text>
      )}
      {claim.patient?.reference && (
        <Anchor href={`/${claim.patient.reference}`} size="sm">
          Open patient chart
        </Anchor>
      )}
    </Stack>
  );
}

function CoverageCard(props: { readonly coverage: Reference<Coverage>; readonly focal: boolean }): JSX.Element {
  const coverage = useResource(props.coverage);
  return (
    <Stack gap={2} className={classes.card}>
      <Group justify="space-between">
        <Text fw={700} size="sm">
          {props.focal ? 'Primary coverage' : 'Coverage'}
        </Text>
        {coverage?.status && (
          <Badge size="sm" variant="light" color={coverage.status === 'active' ? 'green' : 'gray'}>
            {coverage.status}
          </Badge>
        )}
      </Group>
      <Text size="sm">{coverage?.payor?.[0]?.display ?? getReferenceString(props.coverage)}</Text>
      {coverage?.subscriberId && (
        <Text size="xs" c="dimmed">
          Member {coverage.subscriberId}
        </Text>
      )}
    </Stack>
  );
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

function getPayerName(response: ClaimResponse | null): string | undefined {
  return response?.insurer?.display;
}

function getResponseMessage(response: ClaimResponse | undefined): string | undefined {
  return response?.disposition ?? response?.processNote?.[0]?.text ?? response?.error?.[0]?.code?.text;
}
