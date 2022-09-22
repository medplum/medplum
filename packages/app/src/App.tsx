import { AppShell, useMantineTheme } from '@mantine/core';
import { ErrorBoundary, FooterLinks, Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense } from 'react';
import { Slide, ToastContainer } from 'react-toastify';
import { AppNavbar } from './AppNavbar';
import { AppRoutes } from './AppRoutes';

import '@medplum/react/defaulttheme.css';
import '@medplum/react/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import { AppHeader } from './AppHeader';

export function App(): JSX.Element {
  const theme = useMantineTheme();
  // const [opened, setOpened] = useState(false);
  // const navigate = useNavigate();
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
        navbar={profile && <AppNavbar />}
        header={profile && <AppHeader profile={profile} />}
      >
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
      </AppShell>
      {!profile && (
        <FooterLinks>
          <a href="https://www.medplum.com/terms">Terms</a>
          <a href="https://www.medplum.com/privacy">Privacy</a>
        </FooterLinks>
      )}
    </>
  );
}
