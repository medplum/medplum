// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  JsonInput,
  Loader,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getAllQuestionnaireAnswers, getDisplayString, normalizeErrorString } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { CheckinResponse, ItemStatus, Wallet } from '@smart-health-checkin/client';
import { webWallet } from '@smart-health-checkin/client';
import { useCheckin } from '@smart-health-checkin/client/react';
import {
  IconAlertTriangle,
  IconChevronRight,
  IconClipboardList,
  IconDeviceMobile,
  IconId,
  IconMoodSmile,
  IconPill,
  IconStethoscope,
  IconUser,
  IconVaccine,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { SavedCheckIn } from '../utils/save-check-in';
import { saveCheckIn } from '../utils/save-check-in';
import classes from './CheckInPage.module.css';
import { checkInRequest, decliningTestWalletUrl, walletRegistryUrl } from './CheckInPage.data';

const decliningTestWallet = webWallet({
  id: 'smart-testing-wallet-decline-immunizations',
  name: 'SMART Testing Wallet (declines immunizations)',
  description: 'Testing only: always declines the immunizations item.',
  walletUrl: decliningTestWalletUrl,
});

const checkInOptions = {
  registry: walletRegistryUrl,
  extra: [decliningTestWallet],
  // Connectathon wallets sign cards with their own keys, not ones in the VCI directory
  healthCards: { accept: 'any-valid' as const },
};

const statusColors: Record<ItemStatus, string> = {
  fulfilled: 'green',
  partial: 'yellow',
  unavailable: 'gray',
  declined: 'gray',
  unsupported: 'orange',
  error: 'red',
};

const itemIcons: Record<string, typeof IconUser> = {
  patient: IconUser,
  problems: IconStethoscope,
  allergies: IconAlertTriangle,
  medications: IconPill,
  immunizations: IconVaccine,
  coverage: IconId,
  phq2: IconMoodSmile,
};

type SendState =
  | { readonly state: 'idle' | 'sending' }
  | { readonly state: 'sent'; readonly saved: SavedCheckIn }
  | { readonly state: 'error'; readonly message: string };

export function CheckInPage(): JSX.Element {
  const medplum = useMedplum();
  const { wallets, start, status, result } = useCheckin(checkInRequest, checkInOptions);
  const [searchParams] = useSearchParams();
  const [chosen, setChosen] = useState<Wallet>();
  const [startingOver, setStartingOver] = useState(false);
  const [send, setSend] = useState<SendState>({ state: 'idle' });
  const showTestWallets = searchParams.has('test');
  const offered = wallets.filter((w) => showTestWallets || w.id !== decliningTestWallet.id);
  // useCheckin keeps the last result while a new check-in runs, so hide it until the new one lands
  const current = status === 'waiting' || startingOver ? undefined : result;

  const sendToCareTeam = async (): Promise<void> => {
    if (current?.status !== 'completed') {
      return;
    }
    const patient = medplum.getProfile();
    if (patient?.resourceType !== 'Patient') {
      setSend({ state: 'error', message: 'Sign in as a patient to send a check-in.' });
      return;
    }
    setSend({ state: 'sending' });
    try {
      setSend({
        state: 'sent',
        saved: await saveCheckIn(medplum, patient as WithId<Patient>, current.response, current.wallet.name),
      });
    } catch (err) {
      setSend({ state: 'error', message: normalizeErrorString(err) });
    }
  };

  const startOver = (): void => {
    setStartingOver(true);
    setSend({ state: 'idle' });
  };

  return (
    <Container py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>{current?.status === 'completed' ? 'Review your check-in' : 'Check in'}</Title>
          <Text c="dimmed" mt={4}>
            {current?.status === 'completed'
              ? `Here's what ${current.wallet.name} shared. Nothing goes to your care team until you send it.`
              : 'Share your records and answer a short form from your health app before your visit.'}
          </Text>
        </div>

        {status === 'waiting' && (
          <Card withBorder radius="md" p="lg">
            <Group wrap="nowrap">
              <Loader size="sm" />
              <div>
                <Text fw={500}>Waiting for {chosen?.name ?? 'your app'}</Text>
                <Text size="sm" c="dimmed">
                  Approve the request in the tab that opened, then come back here.
                </Text>
              </div>
            </Group>
          </Card>
        )}

        {current?.status === 'declined' && <Alert color="gray">You cancelled the check-in in your app.</Alert>}
        {current?.status === 'failed' && (
          <Alert color="red" title={`Check-in failed (${current.error.code})`}>
            {current.error.message}
          </Alert>
        )}

        {current?.status === 'completed' ? (
          <>
            {current.warnings.length > 0 && (
              <Alert color="yellow" title="Warnings">
                {current.warnings.map((w) => (
                  <Text key={w.code + w.message} size="sm">
                    {w.message} ({w.rule})
                  </Text>
                ))}
              </Alert>
            )}
            <CheckInResult response={current.response} />
            <ReviewActions send={send} onSend={sendToCareTeam} onDiscard={startOver} />
          </>
        ) : (
          <Grid align="stretch">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Card withBorder radius="md" p="lg" h="100%">
                <Group gap="xs" mb="md">
                  <IconClipboardList size={20} />
                  <Title order={4}>Your clinic is asking for</Title>
                </Group>
                <Stack gap="sm">
                  {checkInRequest.items.map((item) => (
                    <Group key={item.id} gap="sm" wrap="nowrap">
                      <ItemIcon itemId={item.id} size="lg" />
                      <Text size="sm">{item.title}</Text>
                    </Group>
                  ))}
                </Stack>
                <Text size="sm" c="dimmed" mt="md">
                  You choose what to share in your app. Anything you skip is fine.
                </Text>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 7 }}>
              <Stack gap="sm">
                <Title order={4}>Choose your health app</Title>
                {offered.map((wallet) => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    disabled={status === 'waiting'}
                    onClick={() => {
                      setChosen(wallet);
                      setStartingOver(false);
                      setSend({ state: 'idle' });
                      start(wallet).catch(console.error);
                    }}
                  />
                ))}
                {offered.length === 0 && <Loader size="sm" />}
              </Stack>
            </Grid.Col>
          </Grid>
        )}
      </Stack>
    </Container>
  );
}

function ReviewActions({
  send,
  onSend,
  onDiscard,
}: {
  readonly send: SendState;
  readonly onSend: () => Promise<void>;
  readonly onDiscard: () => void;
}): JSX.Element {
  if (send.state === 'sent') {
    return (
      <Alert color="green" title="Sent to your care team">
        <Stack gap="xs">
          <Text size="sm">They'll review it before your visit.</Text>
          {send.saved.warnings.map((w) => (
            <Text key={w} size="sm" c="orange">
              {w}
            </Text>
          ))}
          <Group>
            <Button variant="default" onClick={onDiscard}>
              Check in again
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }
  return (
    <Stack gap="xs">
      {send.state === 'error' && (
        <Alert color="red" title="Couldn't send your check-in">
          {send.message}
        </Alert>
      )}
      <Group>
        <Button loading={send.state === 'sending'} onClick={() => onSend().catch(console.error)}>
          {send.state === 'error' ? 'Try again' : 'Send to my care team'}
        </Button>
        <Button variant="default" disabled={send.state === 'sending'} onClick={onDiscard}>
          Discard
        </Button>
      </Group>
    </Stack>
  );
}

function ItemIcon({ itemId, size }: { readonly itemId: string; readonly size: 'md' | 'lg' }): JSX.Element {
  const Icon = itemIcons[itemId] ?? IconClipboardList;
  return (
    <ThemeIcon variant="light" radius="md" size={size}>
      <Icon size={size === 'lg' ? 18 : 16} />
    </ThemeIcon>
  );
}

function WalletCard({
  wallet,
  disabled,
  onClick,
}: {
  readonly wallet: Wallet;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <UnstyledButton className={classes.walletCard} disabled={disabled} onClick={onClick}>
      <Card withBorder radius="md" p="md" className={classes.walletCardInner}>
        <Group wrap="nowrap">
          {wallet.iconUrl ? (
            <Avatar src={wallet.iconUrl} radius="md" size="lg" />
          ) : (
            <ThemeIcon variant="light" radius="md" size={56}>
              <IconDeviceMobile size={28} />
            </ThemeIcon>
          )}
          <div style={{ flex: 1 }}>
            <Group gap="xs">
              <Text fw={500}>{wallet.name}</Text>
              {wallet.kind === 'platform' && (
                <Badge variant="light" size="sm">
                  On this device
                </Badge>
              )}
            </Group>
            {wallet.description && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {wallet.description}
              </Text>
            )}
          </div>
          <IconChevronRight size={20} color="var(--mantine-color-dimmed)" />
        </Group>
      </Card>
    </UnstyledButton>
  );
}

function CheckInSummary({ response }: { readonly response: CheckinResponse }): JSX.Element {
  const items = response.items();
  const shared = items.filter((i) => i.status === 'fulfilled' || i.status === 'partial').length;
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.status !== 'fulfilled' && item.status !== 'partial') {
      const key = item.status ?? 'no valid status';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return (
    <Group justify="space-between">
      <Title order={3}>
        Shared {shared} of {items.length}
      </Title>
      <Group gap="xs">
        {[...counts].map(([key, count]) => (
          <Badge key={key} variant="light" color={statusColors[key as ItemStatus] ?? 'red'}>
            {count} {key}
          </Badge>
        ))}
      </Group>
    </Group>
  );
}

function CheckInResult({ response }: { readonly response: CheckinResponse }): JSX.Element {
  const disregarded = response.disregarded();
  return (
    <Stack>
      <CheckInSummary response={response} />
      {response.items().map((item) => (
        <Card key={item.id} withBorder radius="md" p="lg">
          <Group justify="space-between">
            <Group gap="sm">
              <ItemIcon itemId={item.id} size="md" />
              <Title order={4}>{item.title}</Title>
            </Group>
            <Badge color={item.status ? statusColors[item.status] : 'red'}>{item.status ?? 'no valid status'}</Badge>
          </Group>
          {item.message && <Text c="dimmed">{item.message}</Text>}
          {item.problems.map((p) => (
            <Text key={p.rule + p.message} c="red" size="sm">
              {p.message} ({p.rule})
            </Text>
          ))}
          {response.request.items.find((i) => i.id === item.id)?.content.kind === 'form.fhir' ? (
            <FormAnswers response={response} itemId={item.id} />
          ) : (
            <ItemResources response={response} itemId={item.id} />
          )}
        </Card>
      ))}
      {disregarded.length > 0 && (
        <Alert color="orange" title="Records set aside">
          {disregarded.map((d) => (
            <Text key={d.index} size="sm">
              {d.id ?? `artifact ${d.index}`}: {d.problems.map((p) => p.message).join('; ')}
            </Text>
          ))}
        </Alert>
      )}
      <Accordion variant="contained" radius="md">
        <Accordion.Item value="developer">
          <Accordion.Control>Developer details</Accordion.Control>
          <Accordion.Panel>
            <JsonInput
              label="Response as received"
              autosize
              minRows={8}
              maxRows={30}
              value={JSON.stringify(response.json, undefined, 2)}
              readOnly
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function ItemResources({
  response,
  itemId,
}: {
  readonly response: CheckinResponse;
  readonly itemId: string;
}): JSX.Element {
  const entries = response.entries(itemId);
  const cards = response.healthCards(itemId);
  return (
    <Stack gap="xs" mt="sm">
      {entries.map((entry, i) => (
        <Text key={`${entry.artifactId}-${i}`} size="sm">
          {entry.resource.resourceType}: {getDisplayString(entry.resource as Resource)}
          {entry.source === 'health-card' && ' (SMART Health Card)'}
        </Text>
      ))}
      {cards.map((card) => (
        <Text key={card.jws} size="sm" c={card.accepted ? 'green' : 'red'}>
          Health card from {card.issuer ?? 'unknown issuer'}: {card.valid ? 'signature verified' : 'not verified'}
          {card.reason && ` (${card.reason})`}
        </Text>
      ))}
    </Stack>
  );
}

function FormAnswers({
  response,
  itemId,
}: {
  readonly response: CheckinResponse;
  readonly itemId: string;
}): JSX.Element {
  const qr = response.form(itemId) as QuestionnaireResponse | undefined;
  const content = response.request.items.find((i) => i.id === itemId)?.content;
  const questionnaire = (content?.kind === 'form.fhir' ? content.questionnaire : undefined) as
    Questionnaire | undefined;
  if (!qr) {
    return <Text c="dimmed">No answers.</Text>;
  }
  const answersByLinkId = getAllQuestionnaireAnswers(qr);
  return (
    <Table mt="sm">
      <Table.Tbody>
        {questionnaire?.item
          ?.filter((q) => q.type !== 'display')
          .map((q) => {
            const answers = answersByLinkId[q.linkId] ?? [];
            return (
              <Table.Tr key={q.linkId}>
                <Table.Td>
                  {q.prefix} {q.text}
                </Table.Td>
                <Table.Td>
                  {answers.map((a) => a.valueCoding?.display ?? a.valueString ?? JSON.stringify(a)).join(', ') ||
                    '(no answer)'}
                </Table.Td>
              </Table.Tr>
            );
          })}
      </Table.Tbody>
    </Table>
  );
}
