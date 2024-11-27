import { Title, Image } from '@mantine/core';
import { Logo, SignInForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig, isRegisterEnabled } from './config';

// Define the type for project information
interface ProjectInfo {
  name: string;
  logoUrl: string;
}

export function SignInPage(): JSX.Element {
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getConfig();
  const medplum = useMedplum();

  const [projectName, setProjectName] = useState<string | null>('Medplum');
  const [projectLogoUrl, setProjectLogoUrl] = useState<string | null>(null);
  const clientId = "f3f05f62-7bbb-412e-8d4f-4b253eef17d8"//config.clientId;

  // Fetch project info with an explicit return type
 
  useEffect(() => {
    async function fetchProjectInfo(): Promise<ProjectInfo | null> {
      try {
        const projectInfo: ProjectInfo = await medplum.get(`/auth/clientinfo/${clientId}`);
        setProjectName(projectInfo.name)
        setProjectLogoUrl(projectInfo.logoUrl);
        return null;
      } catch (error) {
        console.error('Failed to fetch project info:', error);
        return null;
      }
    }
  
    fetchProjectInfo().catch(console.error);
  }, [medplum, clientId]);

  const navigateToNext = useCallback(() => {
    // Only redirect to 'next' if it is a pathname to avoid redirecting
    // to a maliciously crafted URL, e.g., /signin?next=https%3A%2F%2Fevil.com
    const nextUrl = searchParams.get('next');
    navigate(nextUrl?.startsWith('/') ? nextUrl : '/');
  }, [searchParams, navigate]);

  useEffect(() => {
    if (profile && searchParams.has('next')) {
      navigateToNext();
    }
  }, [profile, searchParams, navigateToNext]);

  return (
    <SignInForm
      onSuccess={() => navigateToNext()}
      onForgotPassword={() => navigate('/resetpassword')}
      onRegister={isRegisterEnabled() ? () => navigate('/register') : undefined}
      googleClientId={config.googleClientId}
      login={searchParams.get('login') || undefined}
      projectId={searchParams.get('project') || undefined}
    >
       {/* Display logo or fallback */}
       {projectLogoUrl ? (
        <Image
          src={projectLogoUrl || undefined}
          alt={`${projectName} logo`}
          h={32}
          fit="fill"
        />
      ) : (
        <Logo size={32} />
      )}

{/* <Logo size={32} /> */}
      <Title>Sign in to {projectName}</Title>
      {searchParams.get('project') === 'new' && <div>Sign in again to create a new project</div>}
    </SignInForm>
  );
}