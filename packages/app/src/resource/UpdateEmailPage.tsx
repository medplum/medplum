// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Checkbox, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, User } from '@medplum/fhirtypes';
import { Document, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router';

export function UpdateEmailPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const user = useResource<User>({ reference: `User/${id}` });
  const [email, setEmail] = useState('');
  const [updateProfileTelecom, setUpdateProfileTelecom] = useState(false);
  const [skipEmailVerification, setSkipEmailVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return null;
  }

  if (!user.project) {
    return (
      <Document>
        <Alert color="yellow">Update Email is only available for project-scoped Users.</Alert>
      </Document>
    );
  }

  function handleSubmit(): void {
    if (!email) {
      return;
    }
    setSubmitting(true);

    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'email', valueString: email }],
    };

    if (updateProfileTelecom) {
      params.parameter?.push({ name: 'updateProfileTelecom', valueBoolean: true });
    }

    if (skipEmailVerification) {
      params.parameter?.push({ name: 'skipEmailVerification', valueBoolean: true });
    }

    medplum
      .post(medplum.fhirUrl('User', id, '$update-email'), params)
      .then(() => {
        showNotification({ color: 'green', message: 'Email updated successfully' });
        setEmail('');
      })
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <Document>
      <Title order={1}>Update Email</Title>
      <p>
        Update the email address for this User. The current email is <strong>{user.email}</strong>.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Stack>
          <TextInput
            label="New Email"
            type="email"
            required
            placeholder="new@example.com"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <Checkbox
            label="Update profile telecom"
            description="Add the new email to the associated profile resource's telecom and mark the old email as old"
            checked={updateProfileTelecom}
            onChange={(e) => setUpdateProfileTelecom(e.currentTarget.checked)}
          />
          <Checkbox
            label="Skip email verification"
            description="Do not send a verification email to the new address"
            checked={skipEmailVerification}
            onChange={(e) => setSkipEmailVerification(e.currentTarget.checked)}
          />
          <div>
            <Button type="submit" loading={submitting} disabled={!email}>
              Update Email
            </Button>
          </div>
        </Stack>
      </form>
    </Document>
  );
}
