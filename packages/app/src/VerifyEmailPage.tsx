// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Center, Group, Stack, Title } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  Logo,
  MedplumLink,
  OperationOutcomeAlert,
  getIssuesForExpression,
  useMedplum,
} from '@medplum/react';
import { JSX, useState } from 'react';
import { useParams } from 'react-router';

export function VerifyEmailPage(): JSX.Element {
  const { id, secret } = useParams() as { id: string; secret: string };
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);
  const issues = getIssuesForExpression(outcome, undefined);

  return (
    <Document width={450}>
      <OperationOutcomeAlert issues={issues} />
      <Form
        onSubmit={() => {
          setOutcome(undefined);
          const body = {
            id,
            secret,
          };
          medplum
            .post('auth/verifyemail', body)
            .then(() => setSuccess(true))
            .catch((err) => setOutcome(normalizeOperationOutcome(err)));
        }}
      >
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>Email address verification required</Title>
        </Center>
        {!success && (
          <Stack>
            <p>
              In order to sign in, click the button below to verify your ability to receive email at the address this
              link was sent to.
            </p>
            <Group justify="flex-end" mt="xl">
              <Button type="submit">Verify email</Button>
            </Group>
          </Stack>
        )}
        {success && (
          <div data-testid="success">
            Email verified. You can now&nbsp;<MedplumLink to="/signin">sign in</MedplumLink>.
          </div>
        )}
      </Form>
    </Document>
  );
}
