// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, SegmentedControl, Table, Text, VisuallyHidden } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Bundle, ProjectMembership, Resource, User } from '@medplum/fhirtypes';
import type { SearchLoadEvent } from '@medplum/react';
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
   * When true, appends a read-only enrollment column for each MFA method the project
   * allows (see the `allowedMfaMethods` project setting): "Authenticator" for TOTP
   * and "Email MFA" for email. Only meaningful for tables of human users; requires
   * project admin access to read the members' User resources.
   */
  readonly showMfaEnrollment?: boolean;
}

const MFA_ENROLLMENT_COLUMN_NAMES: Record<MfaMethod, string> = {
  totp: 'MFA: Authenticator',
  email: 'MFA: Email',
};

/**
 * A read-only, computed column rendered alongside the {@link SearchControl} results.
 *
 * These columns are not backed by a search parameter, so they cannot live inside the
 * shared {@link SearchControl} table. Instead we render them in a companion table
 * (see {@link MemberTable}) whose rows are kept in lock-step with the SearchControl's
 * rows: both render the same search-response entries, in the same order.
 */
interface ExtraColumn {
  readonly name: string;
  readonly renderCell: (resource: Resource) => ReactNode;
}

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

  const { showMfaEnrollment } = props;
  const [allowedMfaMethods, setAllowedMfaMethods] = useState<MfaMethod[] | undefined>();
  const [memberUsers, setMemberUsers] = useState<Record<string, User>>({});
  // The most recent search-result rows, in SearchControl's render order, so the
  // companion table (see below) can render an aligned row for each member.
  const [rows, setRows] = useState<Resource[]>([]);

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
      // Mirror the entries SearchControl renders (see `resources` in SearchControl):
      // both derive from `response.entry` in the same order, keeping the companion
      // table's rows aligned with the search table's rows.
      const entries = e.response.entry ?? [];
      setRows(entries.map((entry) => entry.resource).filter((r): r is Resource => r !== undefined));
      const ids = Array.from(
        new Set(
          entries
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

  const extraColumns = useMemo<ExtraColumn[] | undefined>(() => {
    if (!showMfaEnrollment) {
      return undefined;
    }
    const columns: ExtraColumn[] = [
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
        ...allowedMfaMethods
          .toSorted((a, b) => b.localeCompare(a))
          .map((method) => ({
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

  const searchControl = (
    <SearchControl
      search={search}
      onClick={(e) => navigate(`./${e.resource.id}`)}
      onChange={(e) => setSearch(e.definition)}
      onLoad={handleLoad}
      hideFilters
      hideToolbar
    />
  );

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
      {extraColumns ? (
        // The extra columns are computed (not search-backed), so they can't live inside
        // the shared SearchControl table. Render them in a companion table pinned to the
        // right whose rows track SearchControl's rows one-for-one (see `rows`/`handleLoad`).
        <Group align="flex-start" gap={0} wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>{searchControl}</Box>
          {rows.length > 0 && (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  {extraColumns.map((col) => (
                    <Table.Th key={col.name} p={0}>
                      <Text fw={500} px="md" py="xs" style={{ whiteSpace: 'nowrap' }}>
                        {col.name}
                      </Text>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((resource) => (
                  <Table.Tr
                    key={resource.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`./${resource.id}`)}
                  >
                    {extraColumns.map((col) => (
                      <Table.Td key={col.name}>{col.renderCell(resource)}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Group>
      ) : (
        searchControl
      )}
    </>
  );
}
