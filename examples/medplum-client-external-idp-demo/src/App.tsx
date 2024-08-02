import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { SignInPage } from './SignInPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  // If we're still loading, return a blank page
  if (medplum.isLoading()) {
    return null;
  }

  // If signed in, navigate to the home page. Otherwise, redirect to the Sign in page
  return (
    <AppShell logo={<Logo size={24} />} resourceTypeSearchDisabled={true}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={profile ? <HomePage /> : <Navigate to="/signin" replace />} />
          <Route path="/signin" element={<SignInPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
