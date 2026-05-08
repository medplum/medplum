// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Group, Stack, Title } from '@mantine/core';
import { locationUtils, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  Logo,
  MedplumLink,
  OperationOutcomeAlert,
  SubmitButton,
  getIssuesForExpression,
  useMedplum,
} from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
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
        onSubmit={async () => {
          setOutcome(undefined);
          try {
            const result = await medplum.post<OperationOutcome | undefined>('auth/verifyemail', { id, secret });
            const uri = result?.issue?.[0]?.details?.coding?.find((c) => c.system === 'urn:ietf:rfc:3986')?.code;
            if (uri) {
              locationUtils.assign(uri);
            } else {
              setSuccess(true);
            }
          } catch (err) {
            setOutcome(normalizeOperationOutcome(err));
          }
        }}
      >
        <Flex direction="column" align="center" justify="center">
          <Logo size={32} />
          <Title>Email address verification required</Title>
        </Flex>
        {!success && (
          <Stack>
            <p>
              In order to sign in, click the button below to verify your ability to receive email at the address this
              link was sent to.
            </p>
            <Group justify="center" mt="xl">
              <SubmitButton>Verify email</SubmitButton>
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
