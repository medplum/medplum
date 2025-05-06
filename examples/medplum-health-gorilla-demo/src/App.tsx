import { AppShell, Container, Logo, Panel, useMedplum, useMedplumProfile } from '@medplum/react';
import { Link, Route, Routes } from 'react-router';
import { SignInPage } from './pages/SignInPage';
import { HomePage } from './pages/HomePage';
import { Title } from '@mantine/core';

export function App(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  if (medplum.isLoading()) {
    return <div>Loading...</div>;
  }

  return (
    <AppShell logo={<Logo size={24} />}>
      <Routes>
        <Route path="/" element={profile ? <HomePage /> : <SignInPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function NotFound(): JSX.Element {
  return (
    <Container size="sm">
      <Panel>
        <Title>404: Page not found</Title>
        <Link to="/">Go to home page</Link>
      </Panel>
    </Container>
  );
}
