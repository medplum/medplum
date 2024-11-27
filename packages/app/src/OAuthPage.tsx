import { Title } from '@mantine/core';
import { CodeChallengeMethod, normalizeErrorString } from '@medplum/core';
import { Logo, SignInForm, useMedplum } from '@medplum/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig } from './config';
import { useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';

interface ClientInfo {
  name: string;
  logoUrl: string;
}

export function OAuthPage(): JSX.Element | null {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const medplum = useMedplum();
  const scope = params.get('scope') || 'openid';
  const [clientName, setClientName] = useState<string | null>('Medplum');
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const clientId = params.get('client_id');
  
  useEffect(() => {
    if (!clientId) {
      return;
    }
    async function fetchProjectInfo(): Promise<void> {
      try {
        const projectInfo: ClientInfo = await medplum.get(`/auth/clientinfo/${clientId}`);
        setClientName(projectInfo.name)
        setClientLogoUrl(projectInfo.logoUrl);
      } catch (err) {
        showNotification({
          id: 'clientinfofail',
          title: 'Batch Upload Failed',
          color: 'red',
          message: normalizeErrorString(err),
          withCloseButton: true,
        });
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
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={() => navigate('/register')}
      googleClientId={getConfig().googleClientId}
      clientId={clientId || undefined}
      redirectUri={params.get('redirect_uri') || undefined}
      scope={scope}
      nonce={params.get('nonce') || undefined}
      launch={params.get('launch') || undefined}
      codeChallenge={params.get('code_challenge') || undefined}
      codeChallengeMethod={(params.get('code_challenge_method') as CodeChallengeMethod) || undefined}
      chooseScopes={scope !== 'openid'}
    >

      {clientLogoUrl ? (
        <img
          src={clientLogoUrl || undefined}
          alt={`${clientName} logo`}
          height={32}
          style={{ width: 'auto' }} 
        />
      ) : (
        <Logo size={32} />
      )}
      
      <Title>{clientName || 'Sign in to Medplum'}</Title>
    </SignInForm>
  );
}
