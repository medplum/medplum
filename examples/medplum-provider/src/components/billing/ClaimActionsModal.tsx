// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Radio, SimpleGrid, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatMoney, getDisplayString } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { Loading, Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import type { ClaimActionId, ClaimActionResult } from './claimActions';
import { CLAIM_ACTIONS, refreshClaim, runOnEach, submitClaim } from './claimActions';
import { ComingSoon } from './ComingSoon';

export interface ClaimActionsModalProps {
  readonly opened: boolean;
  readonly claimIds: string[];
  /** Starts on this action, e.g. Submit for "Submit all". */
  readonly initialAction?: ClaimActionId;
  readonly title?: string;
  readonly onClose: () => void;
  /** Called after an action ran, so lists can reload. */
  readonly onDone: () => void;
  /** Called with the eligible claims when the user continues with Set follow-up. */
  readonly onFollowUp: (claimIds: string[]) => void;
}

/**
 * Runs an action on the checked claims. Mount it only while open, so each opening starts fresh. Before anything runs it previews which claims the action applies to and
 * why the rest are skipped; afterwards it reports each claim that failed.
 * @param props - The ClaimActionsModal React props.
 * @returns The ClaimActionsModal React node.
 */
export function ClaimActionsModal(props: ClaimActionsModalProps): JSX.Element {
  const { opened, claimIds, initialAction, title, onClose, onDone, onFollowUp } = props;
  const medplum = useMedplum();
  const [claims, setClaims] = useState<WithId<Claim>[]>();
  const [actionId, setActionId] = useState<ClaimActionId>(initialAction ?? 'submit');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ClaimActionResult[]>();

  useEffect(() => {
    let active = true;
    medplum
      .searchResources('Claim', { _id: claimIds.join(','), _count: String(claimIds.length) }, { cache: 'no-cache' })
      .then((found) => active && setClaims(found))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [claimIds, medplum]);

  const action = CLAIM_ACTIONS.find((a) => a.id === actionId) ?? CLAIM_ACTIONS[0];
  const eligible = (claims ?? []).filter((c) => !action.check(c));
  const skipped = (claims ?? []).filter((c) => action.check(c));

  const run = async (): Promise<void> => {
    if (action.id === 'follow-up') {
      onFollowUp(eligible.map((c) => c.id));
      return;
    }
    setRunning(true);
    const runner = action.id === 'submit' ? submitClaim : refreshClaim;
    const next = await runOnEach(eligible, (claim) => runner(medplum, claim));
    setRunning(false);
    setResults(next);
    onDone();
  };

  const failed = results?.filter((r) => r.error) ?? [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={title ?? `Claim actions · ${claimIds.length} selected`}
      actions={
        results ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <Button
            loading={running}
            disabled={!claims || action.comingSoon || eligible.length === 0}
            onClick={() => run().catch(showErrorNotification)}
          >
            {action.id === 'follow-up' ? 'Continue' : `${action.label} ${eligible.length} ${plural(eligible.length)}`}
          </Button>
        )
      }
    >
      {!claims && <Loading />}
      {claims && results && (
        <Stack gap="sm">
          <Text>
            {action.label}: {results.length - failed.length} of {results.length} {plural(results.length)} done.
          </Text>
          {failed.length > 0 && (
            <ClaimList
              title="Failed"
              claims={failed.map((r) => r.claim)}
              reason={(c) => failed.find((r) => r.claim.id === c.id)?.error}
            />
          )}
        </Stack>
      )}
      {claims && !results && (
        <Stack gap="md">
          {!initialAction && (
            <Radio.Group label="Action" value={actionId} onChange={(value) => setActionId(value as ClaimActionId)}>
              <Stack gap={6} mt={6}>
                {CLAIM_ACTIONS.map((a) => (
                  <Radio
                    key={a.id}
                    value={a.id}
                    disabled={a.comingSoon}
                    label={
                      <Group gap="xs">
                        <span>{a.label}</span>
                        {a.comingSoon && <ComingSoon />}
                      </Group>
                    }
                  />
                ))}
              </Stack>
            </Radio.Group>
          )}
          <SimpleGrid cols={3} spacing="xs">
            <Count label="Selected" value={claims.length} />
            <Count
              label={action.id === 'follow-up' ? 'Included' : `Will ${action.label.toLowerCase()}`}
              value={eligible.length}
              color="green"
            />
            <Count label="Skipped" value={skipped.length} color={skipped.length ? 'orange' : undefined} />
          </SimpleGrid>
          {skipped.length > 0 && <ClaimList title="Skipped" claims={skipped} reason={(c) => action.check(c)} />}
          <Text size="xs" c="dimmed">
            Each claim runs on its own, so one failure doesn't stop the rest.
          </Text>
        </Stack>
      )}
    </Modal>
  );
}

function Count(props: { readonly label: string; readonly value: number; readonly color?: string }): JSX.Element {
  return (
    <Paper withBorder p="xs" radius="md">
      <Text size="xl" fw={800} c={props.color}>
        {props.value}
      </Text>
      <Text size="xs" c="dimmed">
        {props.label}
      </Text>
    </Paper>
  );
}

function ClaimList(props: {
  readonly title: string;
  readonly claims: Claim[];
  readonly reason: (claim: Claim) => string | undefined;
}): JSX.Element {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {props.title}
      </Text>
      {props.claims.map((claim) => (
        <Group key={claim.id} justify="space-between" wrap="nowrap">
          <Text size="sm" truncate>
            {claim.patient?.display ?? getDisplayString(claim)} {claim.total && `· ${formatMoney(claim.total)}`}
          </Text>
          <Text size="xs" c="dimmed">
            {props.reason(claim)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

function plural(n: number): string {
  return n === 1 ? 'claim' : 'claims';
}
