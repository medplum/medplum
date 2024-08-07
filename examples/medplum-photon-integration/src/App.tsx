import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconRobot, IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';

import '@photonhealth/elements';
import { PHOTON_CLIENT_ID, PHOTON_ORG_ID } from './config';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <photon-client id={PHOTON_CLIENT_ID} org={PHOTON_ORG_ID} dev-mode="true" auto-login="true">
      <AppShell
        logo={<Logo size={24} />}
        menus={[
          {
            title: 'My Links',
            links: [{ icon: <IconUser />, label: 'Patients', href: '/' }],
          },
          {
            title: 'Upload Data',
            links: [{ icon: <IconRobot />, label: 'Upload Bots', href: '/upload/bots' }],
          },
        ]}
      >
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/Patient/:id/*" element={<PatientPage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
              <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
              <Route path="/upload/:dataType" element={<UploadDataPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </photon-client>
  );
}
