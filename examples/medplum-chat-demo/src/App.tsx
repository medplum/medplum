import { formatSearchQuery, getReferenceString, Operator } from '@medplum/core';
import { AppShell, Loading, Logo, useMedplum, useMedplumProfile, NavbarLink } from '@medplum/react';
import { IconMessage, IconMessage2Bolt } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CommunicationPage } from './pages/CommunicationPage';
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
    { icon: <IconMessage />, label: 'All Threads', href: '/Communication?part-of:missing=true&status:not=completed' },
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
        { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
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
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/Communication/:id/*" element={<CommunicationPage />} />
          <Route path="/:resourceType" element={<SearchPage />} />
          <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
          <Route path="/Patient/:id/*" element={<PatientPage />} />
          <Route path="/:resourceType/:id" element={<ResourcePage />} />
          <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
