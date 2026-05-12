// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Modal, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { formatHumanName, normalizeErrorString } from '@medplum/core';
import type { HumanName, Parameters, Project, Reference, User } from '@medplum/fhirtypes';
import { Form, FormSection, ReferenceInput, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { getProjectId } from '../utils';

type UserScope = 'loading' | 'project' | 'global';

export function RescopeUserWidget(): JSX.Element {
  const medplum = useMedplum();
  const isSuperAdmin = medplum.isSuperAdmin();
  const currentProjectId = getProjectId(medplum);
  const [opened, { open, close }] = useDisclosure(false);
  const [projectRef, setProjectRef] = useState<Reference<Project> | undefined>(
    !isSuperAdmin && currentProjectId ? { reference: `Project/${currentProjectId}` } : undefined
  );
  const [user, setUser] = useState<User | undefined>();
  const [currentScope, setCurrentScope] = useState<UserScope>('loading');
  const [submitting, setSubmitting] = useState(false);

  const projectReference = projectRef?.reference;
  const projectIdForScope = projectReference?.split('/')[1];

  useEffect(() => {
    if (!user?.id) {
      setCurrentScope('loading');
      return undefined;
    }
    let cancelled = false;
    setCurrentScope('loading');
    medplum
      .readResource('User', user.id)
      .then((u) => {
        if (cancelled) {
          return;
        }
        setCurrentScope(u.meta?.project && u.meta.project === projectIdForScope ? 'project' : 'global');
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentScope('global');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [medplum, user, projectIdForScope]);

  let targetScope: 'project' | 'global' | undefined;
  if (currentScope === 'project') {
    targetScope = 'global';
  } else if (currentScope === 'global' && isSuperAdmin) {
    targetScope = 'project';
  }
  const canSubmit = Boolean(projectReference && user?.id && targetScope);

  function handleSubmit(): void {
    if (!canSubmit) {
      return;
    }
    open();
  }

  function executeRescope(): void {
    if (!user?.id || !targetScope) {
      return;
    }
    setSubmitting(true);
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'scope', valueCode: targetScope }],
    };
    if (targetScope === 'project' && projectRef) {
      params.parameter?.push({ name: 'project', valueReference: projectRef });
    }
    medplum
      .post(medplum.fhirUrl('User', user.id, '$rescope'), params)
      .then(() => {
        showNotification({ color: 'green', message: 'User rescoped successfully' });
        medplum.invalidateSearches('User');
        setUser(undefined);
        close();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  const projectLabel = projectRef?.display ?? projectReference ?? '(no project selected)';
  const userSearchCriteria = projectReference ? { '_has:ProjectMembership:user:project': projectReference } : undefined;
  const userDisplay = user ? formatUser(user) : undefined;

  return (
    <>
      <Title order={2}>Rescope User</Title>
      <p>
        Move a User between <strong>global</strong> scope (not tied to any Project) and <strong>project</strong> scope
        (owned by a specific Project).{' '}
        {isSuperAdmin
          ? 'Selecting a project-scoped User releases them to global; selecting a global User assigns them to the chosen Project.'
          : 'Project admins may release a project-scoped User in this Project to global scope. Re-assigning a User to a Project requires a super admin.'}
      </p>
      <Form onSubmit={handleSubmit}>
        <Stack>
          {isSuperAdmin && (
            <FormSection title="Project (required)" htmlFor="rescopeTargetProject">
              <ReferenceInput<Project>
                name="rescopeTargetProject"
                placeholder="Select a Project"
                targetTypes={['Project']}
                onChange={(ref) => {
                  setProjectRef(ref);
                  setUser(undefined);
                }}
              />
            </FormSection>
          )}
          <FormSection
            title="User (search by email; filtered to members of the selected Project)"
            htmlFor="rescopeTargetUser"
          >
            <ResourceInput<User>
              key={projectReference ?? 'no-project'}
              name="rescopeTargetUser"
              resourceType="User"
              placeholder={projectReference ? 'Search by email' : 'Select a Project first'}
              disabled={!projectReference}
              searchCriteria={userSearchCriteria}
              onChange={(u) => setUser(u ?? undefined)}
            />
          </FormSection>
          {user && (
            <Group gap="sm">
              <Text>{userDisplay}</Text>
              {renderScopeBadge(currentScope)}
            </Group>
          )}
          {user && currentScope === 'global' && !isSuperAdmin && (
            <Alert color="yellow">
              This User is in <strong>global</strong> scope. Only a super admin can assign a global User to a Project.
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={!canSubmit}>
              {targetScope === 'project' ? 'Assign User to Project' : 'Release User to Global'}
            </Button>
          </div>
        </Stack>
      </Form>
      <Modal opened={opened} onClose={close} title="Confirm User Rescope" centered size="auto">
        <Stack>
          <Text>
            You are about to change the scope of <strong>User/{user?.id}</strong>.
          </Text>
          {targetScope === 'global' ? (
            <Text>
              This will <strong>release</strong> the User from project <strong>{projectLabel}</strong> to{' '}
              <strong>global</strong> scope. Any existing ProjectMemberships will be left in place and may be left
              orphaned.
            </Text>
          ) : (
            <Text>
              This will <strong>assign</strong> the User to project <strong>{projectLabel}</strong>. The User will
              become a project-scoped resource belonging to that Project.
            </Text>
          )}
          {targetScope === 'global' && !isSuperAdmin && (
            <Alert color="red" title="This change cannot be reversed by a project admin">
              <strong>You will need the help of a super admin to reverse this change.</strong> Once the User is released
              to global scope, only a super admin can re-assign the User back to this (or any) Project.
            </Alert>
          )}
          <Text c="red">This is a privileged operation. Double-check the User and target before continuing.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button color="red" onClick={executeRescope} loading={submitting}>
              Confirm Rescope
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function renderScopeBadge(scope: UserScope): JSX.Element {
  if (scope === 'loading') {
    return <Skeleton height={22} width={70} radius="xl" />;
  }
  if (scope === 'project') {
    return (
      <Badge color="blue" variant="light">
        Project
      </Badge>
    );
  }
  return (
    <Badge color="gray" variant="light">
      Global
    </Badge>
  );
}

function formatUser(user: User): string {
  let name: string | undefined;
  if (user.firstName || user.lastName) {
    const humanName: HumanName = { family: user.lastName };
    if (user.firstName) {
      humanName.given = [user.firstName];
    }
    name = formatHumanName(humanName);
  }
  if (name && user.email) {
    return `${name} (${user.email})`;
  }
  return name ?? user.email ?? `User/${user.id}`;
}
