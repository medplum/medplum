import { formatSearchQuery, getReferenceString, Operator, ProfileResource } from '@medplum/core';
import { AppShell, Loading, Logo, NotificationIcon, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconClipboardCheck, IconFileImport, IconMail, IconMessage, IconMessage2Bolt } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
      notifications={
        profile && (
          <>
            <NotificationIcon
              label="Mail"
              resourceType="Communication"
              countCriteria={`recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Communication?recipient=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconMail />}
              onClick={() =>
                navigate(
                  `/Communication?recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_fields=sender,recipient,subject,status,_lastUpdated`
                )
              }
            />
            <NotificationIcon
              label="Tasks"
              resourceType="Task"
              countCriteria={`owner=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count`}
              subscriptionCriteria={`Task?owner=${getReferenceString(profile as ProfileResource)}`}
              iconComponent={<IconClipboardCheck />}
              onClick={() =>
                navigate(
                  `/Task?owner=${getReferenceString(profile as ProfileResource)}&status:not=completed&_fields=subject,code,description,status,_lastUpdated`
                )
              }
            />
          </>
        )
      }
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
