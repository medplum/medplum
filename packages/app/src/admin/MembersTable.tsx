// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, SegmentedControl, Stack, Text, VisuallyHidden } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { SearchRequest } from '@medplum/core';
import { normalizeErrorString, Operator } from '@medplum/core';
import type { Bundle, ProjectMembership, Resource, User } from '@medplum/fhirtypes';
import type { SearchControlExtraColumn, SearchLoadEvent } from '@medplum/react';
import { SearchControl, useMedplum } from '@medplum/react';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';
import type { MfaMethod } from './mfa';
import { getAllowedMfaMethods, getEnrolledMfaMethods } from './mfa';

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
  /**
   * When true, appends a read-only enrollment column for each MFA method the project
   * allows (see the `allowedMfaMethods` project setting): "Authenticator" for TOTP
   * and "Email MFA" for email. Only meaningful for tables of human users; requires
   * project admin access to read the members' User resources.
   */
  readonly showMfaEnrollment?: boolean;
}

const MFA_ENROLLMENT_COLUMN_NAMES: Record<MfaMethod, string> = {
  totp: 'Authenticator',
  email: 'Email MFA',
};

/**
 * Returns the bare id of a membership's `User/{id}` reference, if it has one.
 * @param membership - The ProjectMembership row resource.
 * @returns The user id, or undefined when the membership has no User reference.
 */
function getMemberUserId(membership: Resource): string | undefined {
  const ref = (membership as ProjectMembership).user?.reference;
  return ref?.startsWith('User/') ? ref.slice('User/'.length) : undefined;
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

  const { showMfaEnrollment } = props;
  const [allowedMfaMethods, setAllowedMfaMethods] = useState<MfaMethod[] | undefined>();
  const [memberUsers, setMemberUsers] = useState<Record<string, User>>({});

  // Load the project's allowed MFA methods to decide which enrollment columns to show.
  useEffect(() => {
    if (!showMfaEnrollment || !projectId) {
      return;
    }
    medplum
      .get(`admin/projects/${projectId}`)
      .then((result) => setAllowedMfaMethods(getAllowedMfaMethods(result.project?.setting)))
      .catch(() => setAllowedMfaMethods(undefined));
  }, [medplum, projectId, showMfaEnrollment]);

  // After each search load, batch-read the member Users so the enrollment columns can
  // reflect each member's enrolled factors. Users the admin cannot read (e.g.
  // server-scoped users) are omitted from the batch and render as unknown ("—").
  const handleLoad = useCallback(
    (e: SearchLoadEvent): void => {
      if (!showMfaEnrollment) {
        return;
      }
      const ids = Array.from(
        new Set(
          (e.response.entry ?? [])
            .map((entry) => (entry.resource ? getMemberUserId(entry.resource) : undefined))
            .filter((id): id is string => id !== undefined)
        )
      );
      if (ids.length === 0) {
        setMemberUsers({});
        return;
      }
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: ids.map((id) => ({ request: { method: 'GET', url: `User/${id}` } })),
      };
      medplum
        .executeBatch(bundle)
        .then((result) => {
          const users: Record<string, User> = {};
          for (const entry of result.entry ?? []) {
            const resource = entry.resource;
            if (resource?.resourceType === 'User' && resource.id) {
              users[resource.id] = resource;
            }
          }
          setMemberUsers(users);
        })
        .catch(() => setMemberUsers({}));
    },
    [medplum, showMfaEnrollment]
  );

  const extraColumns = useMemo<SearchControlExtraColumn[] | undefined>(() => {
    if (!showMfaEnrollment) {
      return undefined;
    }
    const columns: SearchControlExtraColumn[] = [
      {
        name: 'Project-scoped',
        renderCell: (resource: Resource): ReactNode => {
          const userId = getMemberUserId(resource);
          const user = userId ? memberUsers[userId] : undefined;
          return user?.project ? (
            <>
              <IconCheck color="var(--mantine-color-blue-6)" aria-hidden="true" />
              <VisuallyHidden>Project-scoped</VisuallyHidden>
            </>
          ) : (
            <>
              <IconX color="var(--mantine-color-gray-6)" aria-hidden="true" />
              <VisuallyHidden>Not project-scoped</VisuallyHidden>
            </>
          );
        },
      },
    ];
    if (allowedMfaMethods && allowedMfaMethods.length > 0) {
      columns.push(
        ...allowedMfaMethods.map((method) => ({
          name: MFA_ENROLLMENT_COLUMN_NAMES[method],
          renderCell: (resource: Resource): ReactNode => {
            const userId = getMemberUserId(resource);
            const user = userId ? memberUsers[userId] : undefined;
            if (!user) {
              return (
                <Text c="dimmed" size="sm">
                  —
                </Text>
              );
            }
            return getEnrolledMfaMethods(user).includes(method) ? (
              <>
                <IconCheck color="var(--mantine-color-blue-6)" aria-hidden="true" />
                <VisuallyHidden>Enrolled</VisuallyHidden>
              </>
            ) : (
              <>
                <IconX color="var(--mantine-color-gray-6)" aria-hidden="true" />
                <VisuallyHidden>Not enrolled</VisuallyHidden>
              </>
            );
          },
        }))
      );
    }
    return columns;
  }, [showMfaEnrollment, allowedMfaMethods, memberUsers]);

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
        onLoad={handleLoad}
        extraColumns={extraColumns}
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
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={`Actions for ${count} member${count === 1 ? '' : 's'}`}
      centered
    >
      <Stack>
        <Text size="sm">Choose an action to apply to the selected member{count === 1 ? '' : 's'}.</Text>
        <Button
          variant="outline"
          color="red"
          loading={running}
          onClick={() =>
            runForEach('Reset MFA for', (id) =>
              medplum.post(`admin/projects/${props.projectId}/members/${id}/mfa/reset`, { method: 'totp' })
            )
          }
        >
          Reset MFA (authenticator)
        </Button>
        <Button
          variant="outline"
          loading={running}
          onClick={() =>
            runForEach('Sent password reset email to', (id) =>
              medplum.post(`admin/projects/${props.projectId}/members/${id}/resetpassword`, {})
            )
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
            runForEach('Removed', (id) => medplum.delete(`admin/projects/${props.projectId}/members/${id}`), {
              refresh: true,
            }).catch(console.error);
          }}
        >
          Remove from project
        </Button>
      </Stack>
    </Modal>
  );
}
