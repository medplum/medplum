// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { CodeChallengeMethod, normalizeErrorString } from '@medplum/core';
import { ClientApplicationSignInForm } from '@medplum/fhirtypes';
import { Logo, SignInForm, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig } from './config';

export function OAuthPage(): JSX.Element | null {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const medplum = useMedplum();
  const scope = params.get('scope') || 'openid';
  const [clientInfo, setClientInfo] = useState<ClientApplicationSignInForm>();
  const [loading, setLoading] = useState(true);
  const clientId = params.get('client_id');
  const login = params.get('login');

  useEffect(() => {
    if (!clientId || clientId === 'medplum-cli') {
      return;
    }
    async function fetchProjectInfo(): Promise<void> {
      try {
        const info: ClientApplicationSignInForm = await medplum.get(`/auth/clientinfo/${clientId}`);
        setClientInfo(info);
      } catch (err) {
        showNotification({
          id: 'clientinfofail',
          title: 'Failed to retrieve client information.',
          color: 'red',
          message: normalizeErrorString(err),
          withCloseButton: true,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchProjectInfo().catch(console.error);
  }, [medplum, clientId]);

  if (!clientId) {
    return null;
  }

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
      onForgotPassword={() => navigate('/resetpassword')?.catch(console.error)}
      onRegister={() => navigate('/register')?.catch(console.error)}
      googleClientId={getConfig().googleClientId}
      clientId={clientId || undefined}
      redirectUri={params.get('redirect_uri') || undefined}
      scope={scope}
      nonce={params.get('nonce') || undefined}
      launch={params.get('launch') || undefined}
      codeChallenge={params.get('code_challenge') || undefined}
      codeChallengeMethod={(params.get('code_challenge_method') as CodeChallengeMethod) || undefined}
      chooseScopes={scope !== 'openid'}
      login={login || undefined}
    >
      {!loading && (
        <>
          {clientInfo?.logo?.url ? (
            <img src={clientInfo?.logo?.url} alt={`Welcome Logo`} height={60} style={{ width: 'auto' }} />
          ) : (
            <Logo size={32} />
          )}
          <Title>{clientInfo?.welcomeString ?? 'Sign in to Medplum'}</Title>
        </>
      )}
    </SignInForm>
  );
}
