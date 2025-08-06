// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Loading, Logo, useMedplum } from '@medplum/react';
import { JSX, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { HomePage } from './HomePage';
import { SignInPage } from './SignInPage';
import { PatientPage } from './pages/PatientPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();

  // If we're still loading, return a blank page
  if (medplum.isLoading()) {
    return null;
  }

  // If signed in, navigate to the home page. Otherwise, redirect to the Sign in page
  return (
    <AppShell logo={<Logo size={24} />} resourceTypeSearchDisabled={true}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route
            path="/"
            element={medplum.isAuthenticated() ? <HomePage /> : <Navigate to="/signin" replace />}
          />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/Patient" element={<PatientPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
