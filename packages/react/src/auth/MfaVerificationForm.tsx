// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import type { MfaMethod } from './MfaForm';
import { MfaForm } from './MfaForm';

export interface MfaVerificationFormProps {
  /** The MFA methods the user can verify with. */
  readonly methods: MfaMethod[];
  /** The user's email, shown when entering an emailed code. */
  readonly email?: string;
  /**
   * Whether to start in email-code-entry mode. Use when email is the only
   * method (and a code has already been sent), so the user goes straight to
   * entering the code instead of an authenticator code.
   */
  readonly initialEmailMode?: boolean;
  /** Sends (or resends) a verification code to the user's email. */
  readonly onRequestEmailCode: () => void | Promise<void>;
  /** Called with the entered token (an authenticator code or an emailed code). */
  readonly onSubmit: (token: string) => void | Promise<void>;
  /** Optional override for the submit button label. */
  readonly buttonText?: string;
}

/**
 * Shared MFA verification UI used during sign-in and when changing MFA
 * settings. It leads with the authenticator code and, when email is also an
 * available method, offers a "Get a code by email instead" action. Once in
 * email mode it shows the emailed-code entry with a "Resend code" action.
 * @param props - The MfaVerificationForm React props.
 * @returns The MfaVerificationForm React node.
 */
export function MfaVerificationForm(props: MfaVerificationFormProps): JSX.Element {
  const { methods, email, onRequestEmailCode, onSubmit } = props;
  const [emailMode, setEmailMode] = useState(Boolean(props.initialEmailMode));

  const requestEmailCode = (): void => {
    Promise.resolve(onRequestEmailCode())
      .then(() => setEmailMode(true))
      .catch((err: unknown) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  };

  let footer: ReactNode;
  if (emailMode) {
    footer = (
      <Anchor component="button" type="button" size="sm" ta="center" onClick={requestEmailCode}>
        Resend code
      </Anchor>
    );
  } else if (methods.includes('email')) {
    footer = (
      <Anchor component="button" type="button" size="sm" ta="center" onClick={requestEmailCode}>
        Get a code by email instead
      </Anchor>
    );
  }

  return (
    <MfaForm
      title={emailMode ? 'Enter verification code' : 'Enter MFA code'}
      description={
        emailMode ? (
          <>
            Enter the 6-digit code we emailed{email ? ' to ' : ''}
            {email && <strong>{email}</strong>}
          </>
        ) : (
          'Enter the code from your authenticator app.'
        )
      }
      buttonText={props.buttonText ?? 'Submit code'}
      onSubmit={(fields) => onSubmit(fields.token)}
      footer={footer}
    />
  );
}
