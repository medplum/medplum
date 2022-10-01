import { AppShell, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ErrorBoundary, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense } from 'react';
import { Slide, ToastContainer } from 'react-toastify';
import { AppHeader } from './AppHeader';
import { AppNavbar } from './AppNavbar';
import { AppRoutes } from './AppRoutes';
import { Loading } from './components/Loading';

import '@medplum/react/defaulttheme.css';
import '@medplum/react/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

export function App(): JSX.Element {
  const theme = useMantineTheme();
  const [navbarOpen, { toggle }] = useDisclosure(false);
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Loading />;
  }

  return (
    <>
      <ToastContainer
        position="top-right"
        transition={Slide}
        autoClose={3000}
        hideProgressBar
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <AppShell
        styles={{
          main: {
            background: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
          },
        }}
        padding={0}
        fixed={true}
        navbar={(profile && navbarOpen && <AppNavbar />) as React.ReactElement | undefined}
        header={profile && <AppHeader navbarToggle={toggle} />}
      >
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </>
  );
}
