import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFileCheck, IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CoveragePage } from './pages/CoveragePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'My Links',
          links: [
            { icon: <IconFileCheck />, label: 'Coverages', href: '/Coverage' },
            { icon: <IconUser />, label: 'Patients', href: '/Patient' },
          ],
        },
      ]}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
          <Route path="/:resourceType" element={<SearchPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/Coverage/:id/*" element={<CoveragePage />} />
          <Route path="/Patient/:id/*" element={<PatientPage />} />
          <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
          <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
