// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { Logo } from '../Logo/Logo';
import type { MfaMethod } from './MfaForm';
import { MfaForm } from './MfaForm';

export interface MfaEnrollFormProps {
  /** The MFA methods the user is allowed to enroll in. */
  readonly allowedMethods: MfaMethod[];
  /** The TOTP QR code data URL, shown when enrolling an authenticator app. */
  readonly qrCodeUrl?: string;
  /** Enroll the email factor (the server emails a code on subsequent sign-ins). */
  readonly onEnrollEmail: () => void;
  /** Enroll the TOTP factor with the code from the user's authenticator app. */
  readonly onEnrollTotp: (token: string) => void | Promise<void>;
  /** Title for the authenticator (TOTP) QR enrollment step. */
  readonly totpTitle: string;
  /** Optional description shown alongside the TOTP QR code. */
  readonly totpDescription?: ReactNode;
  /** Submit button label for the TOTP step. */
  readonly totpButtonText?: string;
}

/**
 * Shared MFA enrollment UI used during sign-in and on the MFA settings page.
 * When the user is allowed to enroll in more than one method it leads with a
 * chooser; an email-only project shows a single "enable" prompt; otherwise it
 * shows the authenticator (TOTP) QR code. The chooser and email-only screens
 * are identical across contexts, while the TOTP step's wording is supplied by
 * the caller.
 * @param props - The MfaEnrollForm React props.
 * @returns The MfaEnrollForm React node.
 */
export function MfaEnrollForm(props: MfaEnrollFormProps): JSX.Element {
  const { allowedMethods, qrCodeUrl, onEnrollEmail, onEnrollTotp } = props;
  const [selected, setSelected] = useState<MfaMethod>();

  const emailAllowed = allowedMethods.includes('email');
  const totpAllowed = allowedMethods.includes('totp');

  // When both methods are offered, let the user choose first.
  if (emailAllowed && totpAllowed && !selected) {
    return (
      <Center style={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title order={3} py="lg" ta="center">
          Set up multi-factor authentication
        </Title>
        <Stack w="100%">
          <Text c="dimmed" ta="center">
            Choose how you want to verify your identity when you sign in.
          </Text>
          <Button fullWidth onClick={() => setSelected('totp')}>
            Use an authenticator app (recommended)
          </Button>
          <Button fullWidth variant="default" onClick={onEnrollEmail}>
            Continue with email-based MFA
          </Button>
        </Stack>
      </Center>
    );
  }

  // Email-only project setting.
  if (emailAllowed && !totpAllowed) {
    return (
      <Center style={{ flexDirection: 'column' }}>
        <Logo size={32} />
        <Title order={3} py="lg">
          Set up email-based MFA
        </Title>
        <Stack w="100%">
          <Text c="dimmed" ta="center">
            When you sign in, we&apos;ll email you a verification code to confirm your identity.
          </Text>
          <Button fullWidth onClick={onEnrollEmail}>
            Enable email-based MFA
          </Button>
        </Stack>
      </Center>
    );
  }

  // Default: authenticator (TOTP) enrollment via QR code.
  return (
    <MfaForm
      title={props.totpTitle}
      description={props.totpDescription}
      buttonText={props.totpButtonText ?? 'Enroll'}
      qrCodeUrl={qrCodeUrl}
      onSubmit={(fields) => onEnrollTotp(fields.token)}
    />
  );
}
