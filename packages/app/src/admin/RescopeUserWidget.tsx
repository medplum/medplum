// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, NativeSelect, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Parameters, Project, Reference, User } from '@medplum/fhirtypes';
import { Form, FormSection, ReferenceInput, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

type TargetScope = 'project' | 'global';

export function RescopeUserWidget(): JSX.Element {
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [projectRef, setProjectRef] = useState<Reference<Project> | undefined>();
  const [scope, setScope] = useState<TargetScope>('global');
  const [userRef, setUserRef] = useState<Reference<User> | undefined>();
  const [pendingUserId, setPendingUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(): void {
    if (!projectRef?.reference) {
      showNotification({ color: 'red', message: 'Project is required', autoClose: false });
      return;
    }
    if (!userRef?.reference) {
      showNotification({ color: 'red', message: 'User is required', autoClose: false });
      return;
    }
    const id = userRef.reference.split('/')[1];
    if (!id) {
      showNotification({ color: 'red', message: 'Invalid user reference', autoClose: false });
      return;
    }
    setPendingUserId(id);
    open();
  }

  function executeRescope(): void {
    setSubmitting(true);
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'scope', valueCode: scope }],
    };
    if (scope === 'project' && projectRef) {
      params.parameter?.push({ name: 'project', valueReference: projectRef });
    }
    medplum
      .post(medplum.fhirUrl('User', pendingUserId, '$rescope'), params)
      .then(() => {
        showNotification({ color: 'green', message: 'User rescoped successfully' });
        close();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  const projectLabel = projectRef?.display ?? projectRef?.reference ?? '(no project selected)';
  const projectReference = projectRef?.reference;
  const userSearchCriteria = projectReference
    ? { '_has:ProjectMembership:user:project': projectReference }
    : undefined;

  return (
    <>
      <Title order={2}>Rescope User</Title>
      <p>
        Move a User between <strong>global</strong> scope (not tied to any Project) and <strong>project</strong> scope
        (owned by a specific Project). Super admin privileges are required for any scope change that assigns a User to a
        Project.
      </p>
      <Form onSubmit={handleSubmit}>
        <Stack>
          <FormSection title="Project (required)" htmlFor="rescopeTargetProject">
            <ReferenceInput<Project>
              name="rescopeTargetProject"
              placeholder="Select a Project"
              targetTypes={['Project']}
              onChange={(ref) => {
                setProjectRef(ref as Reference<Project> | undefined);
                setUserRef(undefined);
              }}
            />
          </FormSection>
          <NativeSelect
            name="scope"
            label="Target scope"
            data={[
              { value: 'global', label: 'global — release User from the Project' },
              { value: 'project', label: 'project — assign User to the Project' },
            ]}
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value as TargetScope)}
          />
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
              onChange={(user) => setUserRef(user ? createReference(user) : undefined)}
            />
          </FormSection>
          <div>
            <Button type="submit" disabled={!projectReference || !userRef?.reference}>
              Rescope User
            </Button>
          </div>
        </Stack>
      </Form>
      <Modal opened={opened} onClose={close} title="Confirm User Rescope" centered size="auto">
        <Stack>
          <Text>
            You are about to change the scope of <strong>User/{pendingUserId}</strong>.
          </Text>
          {scope === 'global' ? (
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
          <Text c="red">
            This is a privileged operation. Double-check the User and target before continuing.
          </Text>
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
