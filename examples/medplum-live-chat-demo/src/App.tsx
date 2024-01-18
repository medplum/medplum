import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconHome } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { SignInPage } from './pages/SignInPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const location = useLocation();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[{ links: [{ label: 'Home', href: '/', icon: <IconHome /> }] }]}
      resourceTypeSearchDisabled={true}
      headerSearchDisabled={true}
    >
      <ErrorBoundary key={location.key}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
