// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import type { CodeChallengeMethod } from '@medplum/core';
import { locationUtils, normalizeErrorString } from '@medplum/core';
import type { ClientApplicationSignInForm } from '@medplum/fhirtypes';
import { Document, Loading, Logo, SignInForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getConfig } from './config';

export function OAuthPage(): JSX.Element | null {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const medplum = useMedplum();
  const scope = params.get('scope') || 'openid';
  const clientId = params.get('client_id');
  const redirectUri = getRedirectUri(params);
  const login = params.get('login');
  const [clientInfo, setClientInfo] = useState<ClientApplicationSignInForm>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!clientId || !redirectUri) {
      return;
    }
    async function fetchProjectInfo(): Promise<void> {
      try {
        const info: ClientApplicationSignInForm = await medplum.get(
          `/auth/clientinfo/${encodeURIComponent(clientId as string)}?redirect_uri=${encodeURIComponent(redirectUri as string)}`
        );
        setClientInfo(info);
      } catch (err) {
        setError(normalizeErrorString(err));
      } finally {
        setLoading(false);
      }
    }

    fetchProjectInfo().catch(console.error);
  }, [medplum, clientId, redirectUri]);

  if (!clientId || !redirectUri) {
    return <InvalidRequest message="Missing or invalid client ID or redirect URI" />;
  }

  if (loading) {
    return <Loading />;
  }

  if (!clientInfo) {
    return <InvalidRequest message={error ?? 'Unknown client'} />;
  }

  function onCode(code: string): void {
    const redirectUrl = new URL(redirectUri as string);
    for (const key of ['scope', 'state', 'nonce']) {
      if (params.has(key)) {
        redirectUrl.searchParams.set(key, params.get(key) as string);
      }
    }
    redirectUrl.searchParams.set('code', code);
    locationUtils.assign(redirectUrl.toString());
  }

  return (
    <SignInForm
      onCode={onCode}
      onForgotPassword={() => navigate('/resetpassword')?.catch(console.error)}
      onRegister={() => navigate('/register')?.catch(console.error)}
      googleClientId={getConfig().googleClientId}
      clientId={clientId || undefined}
      redirectUri={redirectUri}
      scope={scope}
      nonce={params.get('nonce') || undefined}
      launch={params.get('launch') || undefined}
      codeChallenge={params.get('code_challenge') || undefined}
      codeChallengeMethod={(params.get('code_challenge_method') as CodeChallengeMethod) || undefined}
      chooseScopes={clientInfo?.showScopeSelection ?? scope !== 'openid'}
      login={login || undefined}
    >
      {clientInfo?.logo?.url ? (
        <img src={clientInfo?.logo?.url} alt={`Welcome Logo`} height={60} style={{ width: 'auto' }} />
      ) : (
        <Logo size={32} />
      )}
      <Title>{clientInfo?.welcomeString ?? 'Sign in to Medplum'}</Title>
    </SignInForm>
  );
}

function InvalidRequest({ message }: { readonly message: string }): JSX.Element {
  return (
    <Document width={450}>
      <Alert icon={<IconAlertCircle size={16} />} title="Invalid sign-in request" color="red">
        {message}
      </Alert>
    </Document>
  );
}

const blockedProtocols = ['javascript:', 'data:', 'vbscript:'];

function getRedirectUri(params: URLSearchParams): string | undefined {
  const redirectUri = params.get('redirect_uri');
  if (!redirectUri || !URL.canParse(redirectUri) || blockedProtocols.includes(new URL(redirectUri).protocol)) {
    return undefined;
  }
  return redirectUri;
}
