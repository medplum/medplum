import { Title } from '@mantine/core';
import { Logo, SignInForm } from '@medplum/react';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig } from './config';

export function OAuthPage(): JSX.Element | null {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const clientId = params.get('client_id');
  if (!clientId) {
    return null;
  }

  const scope = params.get('scope') || 'openid';

  function onCode(code: string): void {
    const redirectUrl = new URL(params.get('redirect_uri') as string);
    for (const key of ['scope', 'state', 'nonce']) {
      if (params.has(key)) {
        redirectUrl.searchParams.set(key, params.get(key) as string);
      }
    }
    redirectUrl.searchParams.set('code', code);
    window.location.assign(redirectUrl.toString());
  }

  return (
    <SignInForm
      onCode={onCode}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={() => navigate('/register')}
      googleClientId={getConfig().googleClientId}
      clientId={clientId || undefined}
      scope={scope}
      nonce={params.get('nonce') || undefined}
      launch={params.get('launch') || undefined}
      codeChallenge={params.get('code_challenge') || undefined}
      codeChallengeMethod={params.get('code_challenge_method') || undefined}
      chooseScopes={scope !== 'openid'}
    >
      <Logo size={32} />
      <Title>Sign in to Medplum</Title>
    </SignInForm>
  );
}
