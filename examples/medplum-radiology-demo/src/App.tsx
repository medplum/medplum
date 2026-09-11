// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconRadioactive } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { SignInPage } from './pages/SignInPage';
import { RadiologyPage } from './radiology/RadiologyPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={
        profile
          ? [{ title: 'Worklists', links: [{ icon: <IconRadioactive />, label: 'Radiology', href: '/Radiology' }] }]
          : undefined
      }
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            {profile ? (
              <>
                <Route path="/Radiology" element={<RadiologyPage />} />
                <Route path="/Radiology/:taskId" element={<RadiologyPage />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="*" element={<Navigate to="/Radiology" replace />} />
              </>
            ) : (
              <>
                <Route path="/signin" element={<SignInPage />} />
                <Route path="*" element={<LandingPage />} />
              </>
            )}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
