import {
  Operator,
  SearchRequest,
  formatCodeableConcept,
  formatSearchQuery,
  getReferenceString,
  normalizeErrorString,
} from '@medplum/core';
import { AppShell, Loading, Logo, NavbarLink, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCategory, IconDatabaseImport, IconFileImport, IconGridDots, IconUser } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { TaskPage } from './pages/TaskPage';
import { UploadDataPage } from './pages/UploadDataPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const profileReference = profile && getReferenceString(profile);
  const [userLinks, setUserLinks] = useState<NavbarLink[]>([
    { icon: <IconGridDots />, label: 'All Tasks', href: '/Task' },
  ]);

  useEffect(() => {
    if (!profileReference) {
      return;
    }
    const myTasksQuery = formatSearchQuery({
      resourceType: 'Task',
      fields: ['code', '_lastUpdated', 'owner', 'for', 'priority'],
      sortRules: [{ code: '-priority-order,due-date' }],
      filters: [
        { code: 'owner', operator: Operator.EQUALS, value: profileReference },
        { code: 'status:not', operator: Operator.EQUALS, value: 'completed' },
      ],
    });

    const myTasksLink = { icon: <IconCategory />, label: 'My Tasks', href: `/Task${myTasksQuery}` };

    medplum
      .searchResources('PractitionerRole', {
        practitioner: profileReference,
      })
      .then((roles) => {
        const roleLinks = [];

        for (const role of roles) {
          const roleCode = role?.code?.[0];
          if (!roleCode?.coding?.[0]?.code) {
            continue;
          }

          const search: SearchRequest = {
            resourceType: 'Task',
            fields: ['code', '_lastUpdated', 'owner', 'for', 'priority'],
            sortRules: [{ code: '-priority-order,due-date' }],
            filters: [
              { code: 'owner:missing', operator: Operator.EQUALS, value: 'true' },
              { code: 'performer', operator: Operator.EQUALS, value: roleCode?.coding?.[0]?.code },
            ],
          };

          const searchQuery = formatSearchQuery(search);
          const roleDisplay = formatCodeableConcept(roleCode);
          roleLinks.push({ icon: <IconUser />, label: `${roleDisplay} Tasks`, href: `/Task${searchQuery}` });
        }

        setUserLinks([myTasksLink, ...roleLinks, { icon: <IconGridDots />, label: 'All Tasks', href: '/Task' }]);
      })
      .catch((error) => console.error('Failed to fetch PractitionerRoles', normalizeErrorString(error)));
  }, [profileReference, medplum]);

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Tasks',
          links: userLinks,
        },
        {
          title: 'Upload Data',
          links: [
            { icon: <IconDatabaseImport />, label: 'Upload Core Data', href: '/upload/core' },
            { icon: <IconFileImport />, label: 'Upload Example Data', href: '/upload/example' },
          ],
        },
      ]}
      resourceTypeSearchDisabled={true}
      headerSearchDisabled={true}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/:resourceType" element={<SearchPage />} />
          <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
          <Route path="/Task/:id/*" element={<TaskPage />} />
          <Route path="/Task" element={<SearchPage />} />
          <Route path="/upload/:dataType" element={<UploadDataPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
