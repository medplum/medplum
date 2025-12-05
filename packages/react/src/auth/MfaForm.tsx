// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Center, Image, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { Logo } from '../Logo/Logo';
export type MfaFormFields = 'token';

export interface MfaFormProps {
  readonly title: string;
  readonly buttonText: string;
  readonly description?: string;
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
      <Center style={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title order={3} py="lg">
          {props.title}
        </Title>
        {!props.qrCodeUrl && props.description && (
          <Text c="dimmed" mb="lg" mt="-lg">
            {props.description}
          </Text>
        )}
      </Center>
      {errorMessage && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="lg">
          {errorMessage}
        </Alert>
      )}
      {props.qrCodeUrl && (
        <Center>
          <Stack mb="xl">
            {props.description && (
              <Text c="dimmed" mb="md" mt="-lg" ta="center">
                {props.description}
              </Text>
            )}
            <Image
              src={props.qrCodeUrl}
              alt="Multi Factor Auth QR Code"
              w="60%"
              mx="auto"
              radius="md"
              p="xs"
              bg="var(--mantine-color-white)"
              style={{ border: '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-4))' }}
            />
          </Stack>
        </Center>
      )}
      <Stack gap="sm">
        <TextInput name="token" label="MFA code" autoComplete="one-time-code" required autoFocus />
      </Stack>
      <Stack gap="xs" pt="md">
        <SubmitButton fullWidth>{props.buttonText}</SubmitButton>
      </Stack>
    </Form>
  );
}
