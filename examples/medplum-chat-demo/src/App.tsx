import { formatSearchQuery, getReferenceString, Operator, ProfileResource } from '@medplum/core';
import { AppShell, Loading, Logo, NotificationIcon, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconClipboardCheck, IconFileImport, IconMail, IconMessage, IconMessage2Bolt } from '@tabler/icons-react';
import { Suspense } from 'react';
import { NavigateFunction, Route, Routes, useNavigate } from 'react-router-dom';
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

  // Format a search query to get all active threads assigned to the current user
  const myThreadsQuery = formatSearchQuery({
    resourceType: 'Communication',
    filters: [
      { code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' },
      { code: 'recipient', operator: Operator.EQUALS, value: (profile && getReferenceString(profile)) as string },
      { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
    ],
  });

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          // A section of the sidebar that displays links to see all threads and threads the user is a part of
          title: 'My Links',
          links: [
            {
              icon: <IconMessage />,
              label: 'All Threads',
              href: '/Communication?part-of:missing=true&status:not=completed',
            },
            { icon: <IconMessage2Bolt />, label: 'My Threads', href: `/Communication${myThreadsQuery}` },
          ],
        },
        {
          // A section of the sidebar that links to a page to upload example data for the app
          title: 'Upload Data',
          links: [{ icon: <IconFileImport />, label: 'Upload Example Data', href: 'upload/example' }],
        },
      ]}
      // This adds notification icons for unread messages and active tasks for the current user
      notifications={
        profile && (
          <>
            <MessageNotification profile={profile} navigate={navigate} />
            <TaskNotification profile={profile} navigate={navigate} />
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

interface NotificationProps {
  profile: ProfileResource;
  navigate: NavigateFunction;
}

function MessageNotification({ profile, navigate }: NotificationProps): JSX.Element {
  return (
    <NotificationIcon
      label="Mail"
      resourceType="Communication"
      countCriteria={`recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&_summary=count&part-of:missing=false`}
      subscriptionCriteria={`Communication?recipient=${getReferenceString(profile as ProfileResource)}`}
      iconComponent={<IconMail />}
      onClick={() =>
        navigate(
          `/Communication?recipient=${getReferenceString(profile as ProfileResource)}&status:not=completed&part-of:missing=false&_fields=sender,recipient,subject,status,_lastUpdated`
        )
      }
    />
  );
}

function TaskNotification({ profile, navigate }: NotificationProps): JSX.Element {
  return (
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
  );
}
