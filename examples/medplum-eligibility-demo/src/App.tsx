// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconDatabaseImport, IconFileCheck, IconFileImport, IconRobot, IconUser } from '@tabler/icons-react';
import { JSX, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { CoveragePage } from './pages/CoveragePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';

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
        {
          title: 'Upload Data',
          links: [
            { icon: <IconDatabaseImport />, label: 'Upload Core Data', href: '/upload/core' },
            { icon: <IconFileImport />, label: 'Upload Example Data', href: '/upload/example' },
            { icon: <IconRobot />, label: 'Upload Bots', href: '/upload/bots' },
          ],
        },
      ]}
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
          <Route path="/:resourceType" element={<SearchPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/Coverage/:id">
            <Route index element={<CoveragePage />} />
            <Route path="*" element={<CoveragePage />} />
          </Route>
          <Route path="/Patient/:id">
            <Route index element={<PatientPage />} />
            <Route path="*" element={<PatientPage />} />
          </Route>
          <Route path="/:resourceType/:id">
            <Route index element={<ResourcePage />} />
            <Route path="*" element={<ResourcePage />} />
          </Route>
          <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
          <Route path="/upload/:dataType" element={<UploadDataPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
