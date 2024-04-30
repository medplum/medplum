import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconClipboardHeart, IconClipboardList, IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ChartingPatientPage } from './pages/ChartingPatientPage';
import { EncounterPage } from './pages/EncounterPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
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
          title: 'Charts',
          links: [{ icon: <IconUser />, label: 'Patients', href: '/Patient' }],
        },
        {
          title: 'Encounters',
          links: [
            { icon: <IconClipboardList />, label: 'All Encounters', href: '/Encounter' },
            {
              icon: <IconClipboardHeart />,
              label: 'My Encounters',
              href: `/Encounter?participant=Practitioner/${profile?.id}`,
            },
          ],
        },
      ]}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/Patient/:id/*" element={<ChartingPatientPage />} />
            <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/Encounter/:id/*" element={<EncounterPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
