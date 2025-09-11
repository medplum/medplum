// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Center, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { Logo } from '../Logo/Logo';

export type MfaFormFields = 'token';

export interface MfaFormProps {
  readonly title: string;
  readonly buttonText: string;
  readonly qrCodeUrl?: string;
  readonly onSubmit: (formData: Record<MfaFormFields, string>) => void | Promise<void>;
}

export function MfaForm(props: MfaFormProps): JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string>();
  return (
    <Form
      onSubmit={(formData: Record<MfaFormFields, string>) => {
        setErrorMessage(undefined);
        props.onSubmit(formData)?.catch((err) => setErrorMessage(normalizeErrorString(err)));
      }}
    >
      <Stack>
        <Center style={{ flexDirection: 'column' }}>
          <Logo size={32} />
          <Title>{props.title}</Title>
        </Center>
        {errorMessage && (
          <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
            {errorMessage}
          </Alert>
        )}
        {props.qrCodeUrl && (
          <Stack align="center">
            <Text>Scan this QR code with your authenticator app.</Text>
            <img src={props.qrCodeUrl} alt="Multi Factor Auth QR Code" />
          </Stack>
        )}
        <Stack>
          <TextInput name="token" label="MFA code" required autoFocus />
        </Stack>
        <Group justify="flex-end" mt="xl">
          <SubmitButton>{props.buttonText}</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
