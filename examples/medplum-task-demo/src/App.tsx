import { Anchor, AppShell, Button, Group, Loader, Text } from '@mantine/core';
import { ErrorBoundary, Logo, useMedplum } from '@medplum/react';
import { Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { LandingPage } from './LandingPage';
import { ResourcePage } from './ResourcePage';
import { SignInPage } from './SignInPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();

  if (medplum.isLoading()) {
    return null;
  }

  const profile = medplum.getProfile();

  return (
    <AppShell header={{ height: 60 }}>
      {profile && (
        <AppShell.Header p="md">
          <Group justify="space-between">
            <Group>
              <Anchor to="/" component={Link}>
                <Group gap="xs">
                  <Logo size={17} />
                  <Text>Task Demo</Text>
                </Group>
              </Anchor>
            </Group>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                medplum.signOut().catch(console.error);
                window.location.reload();
              }}
            >
              Sign out
            </Button>
          </Group>
        </AppShell.Header>
      )}
      <ErrorBoundary>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/:resourceType/:id" element={<ResourcePage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
