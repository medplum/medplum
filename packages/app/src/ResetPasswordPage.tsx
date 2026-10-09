// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ResetPasswordForm } from '@medplum/react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { getConfig, isRegisterEnabled } from './config';
import { useAppNavigate } from './useAppNavigate';

export function ResetPasswordPage(): JSX.Element {
  const navigate = useAppNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();
  const projectId = searchParams.get('project') || undefined;

  return (
    <ResetPasswordForm
      projectId={projectId}
      recaptchaSiteKey={config.recaptchaSiteKey}
      onSignIn={() => navigate('/signin')}
      onRegister={isRegisterEnabled() ? () => navigate('/register') : undefined}
    />
  );
}
