// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ResetPasswordForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();
  const projectId = searchParams.get('project') || undefined;

  return (
    <ResetPasswordForm
      projectId={projectId}
      recaptchaSiteKey={config.recaptchaSiteKey}
      onSignIn={() => navigate('/signin')?.catch(console.error)}
      onRegister={isRegisterEnabled() ? () => navigate('/register')?.catch(console.error) : undefined}
    />
  );
}
