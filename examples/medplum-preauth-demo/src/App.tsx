// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Outlet, Route, Routes } from 'react-router';
import { AdminPage } from './pages/AdminPage';
import { LandingPage } from './pages/LandingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { SignInPage } from './pages/SignInPage';

function PractitionerShell(): JSX.Element | null {
  const medplum = useMedplum();
  if (medplum.isLoading()) {
    return null;
  }
  return (
    <AppShell logo={<Logo size={24} />} menus={[]} headerSearchDisabled resourceTypeSearchDisabled>
      <Outlet />
    </AppShell>
  );
}

export function App(): JSX.Element | null {
  const profile = useMedplumProfile();

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* The patient signing page renders outside the practitioner app shell */}
          <Route path="/fill" element={<QuestionnairePage />} />
          <Route element={<PractitionerShell />}>
            <Route path="/" element={profile ? <AdminPage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
