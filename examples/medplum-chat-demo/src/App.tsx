import { formatSearchQuery, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile, NavbarLink } from '@medplum/react';
import { IconMessage, IconMessage2Bolt, IconUser } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PatientHistory } from './components/PatientHistory';
import { PatientOverview } from './components/PatientOverview';
import { Timeline } from './components/Timeline';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const profileReference = profile && getReferenceString(profile);
  const [userLinks, setUserLinks] = useState<NavbarLink[]>([
    { icon: <IconMessage />, label: 'All Thredas', href: '/Communication?part-of:missing=true' },
  ]);

  useEffect(() => {
    if (!profileReference) {
      return;
    }

    const myThreadsQuery = formatSearchQuery({
      resourceType: 'Communication',
      filters: [
        { code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' },
        { code: 'recipient', operator: Operator.EQUALS, value: profileReference },
      ],
    });

    setUserLinks([...userLinks, { icon: <IconMessage2Bolt />, label: 'My Threads', href: myThreadsQuery }]);
  }, [profileReference, medplum]);

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'My Links',
          links: userLinks,
        },
      ]}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/:resourceType" element={<SearchPage />} />
            <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
            <Route path="/Patient/:id" element={<PatientPage />}>
              <Route index element={<PatientOverview />} />
              <Route path="overview" element={<PatientOverview />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="history" element={<PatientHistory />} />
            </Route>
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
