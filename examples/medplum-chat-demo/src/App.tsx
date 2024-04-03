import { formatSearchQuery, getReferenceString, Operator } from '@medplum/core';
import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFileImport, IconMessage, IconMessage2Bolt } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CommunicationPage } from './pages/CommunicationPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const profileReference = (profile && getReferenceString(profile)) as string;
  const userLinks = [
    { icon: <IconMessage />, label: 'All Threads', href: '/Communication?part-of:missing=true&status:not=completed' },
  ];

  const myThreadsQuery = formatSearchQuery({
    resourceType: 'Communication',
    filters: [
      { code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' },
      { code: 'recipient', operator: Operator.EQUALS, value: profileReference },
      { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
    ],
  });

  userLinks.push({ icon: <IconMessage2Bolt />, label: 'My Threads', href: `/Communication${myThreadsQuery}` });

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
        {
          title: 'Upload Data',
          links: [{ icon: <IconFileImport />, label: 'Upload Example Data', href: 'upload/example' }],
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
          <Route path="/upload/:dataType" element={<UploadDataPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
