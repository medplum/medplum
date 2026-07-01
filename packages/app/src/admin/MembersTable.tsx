// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, SegmentedControl, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { normalizeErrorString, Operator } from '@medplum/core';
import { SearchControl, useMedplum } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';

export interface ProfileTypeOption {
  readonly label: string;
  readonly value: string;
}

export interface MemberTableProps {
  readonly profileTypeOptions: ProfileTypeOption[];
  readonly fields: string[];
  readonly toolbarLeft?: ReactNode;
  readonly toolbarRight?: ReactNode;
  /**
   * When true, enables row checkboxes and a bulk "Actions" button for account
   * administration (reset MFA, send password reset email, remove) on the selected
   * members. Applies to one or many selected rows.
   */
  readonly bulkActions?: boolean;
}

export function MemberTable(props: MemberTableProps): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();
  const [profileType, setProfileType] = useState(props.profileTypeOptions[0].value);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionsOpened, setActionsOpened] = useState(false);
  // Bumping this key remounts SearchControl to refresh results after a bulk change.
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ProjectMembership',
    filters: [
      { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
      { code: 'profile-type', operator: Operator.EQUALS, value: profileType },
    ],
    fields: props.fields,
    count: 100,
  });

  function handleProfileTypeChange(value: string): void {
    setProfileType(value);
    setSearch({
      ...search,
      filters: [
        { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
        { code: 'profile-type', operator: Operator.EQUALS, value },
      ],
    });
  }

  const showSegmentedControl = props.profileTypeOptions.length > 1;
  const showToolbar = showSegmentedControl || props.toolbarLeft !== undefined || props.toolbarRight !== undefined;

  return (
    <>
      {showToolbar && (
        <Group justify="space-between" align="center" mb="md" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            {showSegmentedControl && (
              <SegmentedControl
                value={profileType}
                onChange={handleProfileTypeChange}
                data={props.profileTypeOptions}
              />
            )}
            {props.toolbarLeft}
          </Group>
          {props.toolbarRight}
        </Group>
      )}
      <SearchControl
        key={refreshKey}
        search={search}
        onClick={(e) => navigate(`./${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        checkboxesEnabled={props.bulkActions}
        onBulk={
          props.bulkActions
            ? (ids) => {
                setSelectedIds(ids);
                setActionsOpened(true);
              }
            : undefined
        }
        hideFilters
        // The bulk "Actions" button lives in SearchControl's toolbar, so it must be
        // shown when bulk actions are enabled. Bots/clients keep the toolbar hidden.
        hideToolbar={!props.bulkActions}
      />
      {props.bulkActions && projectId && (
        <MemberBulkActionsModal
          opened={actionsOpened}
          onClose={() => setActionsOpened(false)}
          projectId={projectId}
          membershipIds={selectedIds}
          onCompleted={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}

interface MemberBulkActionsModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly membershipIds: string[];
  readonly onCompleted: () => void;
}

/**
 * Presents account administration actions for the selected members. Each action runs
 * across every selected membership and reports how many succeeded or failed.
 * @param props - The component props.
 * @returns The rendered element.
 */
function MemberBulkActionsModal(props: MemberBulkActionsModalProps): JSX.Element {
  const medplum = useMedplum();
  const [running, setRunning] = useState(false);
  const count = props.membershipIds.length;

  async function runForEach(
    verb: string,
    fn: (membershipId: string) => Promise<unknown>,
    { refresh = false }: { refresh?: boolean } = {}
  ): Promise<void> {
    setRunning(true);
    const results = await Promise.allSettled(props.membershipIds.map((id) => fn(id)));
    const failures = results.filter((r) => r.status === 'rejected');
    const succeeded = count - failures.length;
    if (failures.length === 0) {
      showNotification({ color: 'green', message: `${verb} ${succeeded} member${succeeded === 1 ? '' : 's'}.` });
    } else {
      showNotification({
        color: succeeded > 0 ? 'yellow' : 'red',
        autoClose: false,
        message: `${verb} ${succeeded} of ${count}. ${failures.length} failed: ${normalizeErrorString(
          failures[0].reason
        )}`,
      });
    }
    setRunning(false);
    if (refresh) {
      medplum.invalidateSearches('ProjectMembership');
      props.onCompleted();
    }
    props.onClose();
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title={`Actions for ${count} member${count === 1 ? '' : 's'}`} centered>
      <Stack>
        <Text size="sm">Choose an action to apply to the selected member{count === 1 ? '' : 's'}.</Text>
        <Button
          variant="outline"
          color="red"
          loading={running}
          onClick={() => runForEach('Reset MFA for', (id) => medplum.resetMemberMfa(props.projectId, id, 'totp'))}
        >
          Reset MFA (authenticator)
        </Button>
        <Button
          variant="outline"
          loading={running}
          onClick={() =>
            runForEach('Sent password reset email to', (id) => medplum.sendMemberPasswordReset(props.projectId, id))
          }
        >
          Send password reset email
        </Button>
        <Button
          variant="outline"
          color="red"
          loading={running}
          onClick={() => {
            if (!window.confirm(`Remove ${count} member${count === 1 ? '' : 's'} from the project?`)) {
              return;
            }
            runForEach(
              'Removed',
              (id) => medplum.delete(`admin/projects/${props.projectId}/members/${id}`),
              { refresh: true }
            ).catch(console.error);
          }}
        >
          Remove from project
        </Button>
      </Stack>
    </Modal>
  );
}
