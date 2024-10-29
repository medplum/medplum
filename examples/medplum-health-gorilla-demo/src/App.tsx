import { AppShell, Container, Logo, Panel, useMedplum } from '@medplum/react';
import { Link, Route, Routes } from 'react-router-dom';
import { SignInPage } from './SignInPage';
import { HomePage } from './HomePage';
import { Title } from '@mantine/core';

export function App(): JSX.Element {
  const medplum = useMedplum();

  if (medplum.isLoading()) {
    return <div>Loading...</div>;
  }

  return (
    <AppShell logo={<Logo size={24} />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
