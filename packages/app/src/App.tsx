import { AppShell, Aside, Burger, Footer, Header, MediaQuery, Navbar, Text, useMantineTheme } from '@mantine/core';
import { ErrorBoundary, FooterLinks, Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense, useState } from 'react';
import { Slide, ToastContainer } from 'react-toastify';
import { AppRoutes } from './AppRoutes';

import '@medplum/react/defaulttheme.css';
import '@medplum/react/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

export function App(): JSX.Element {
  const theme = useMantineTheme();
  const [opened, setOpened] = useState(false);
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
        navbarOffsetBreakpoint="sm"
        asideOffsetBreakpoint="sm"
        navbar={
          <Navbar p="md" hiddenBreakpoint="sm" hidden={!opened} width={{ sm: 200, lg: 300 }}>
            <Text>Application navbar</Text>
          </Navbar>
        }
        footer={
          <Footer height={60} p="md">
            Application footer
          </Footer>
        }
        header={
          <Header height={70} p="md">
            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
              <MediaQuery largerThan="sm" styles={{ display: 'none' }}>
                <Burger
                  opened={opened}
                  onClick={() => setOpened((o) => !o)}
                  size="sm"
                  color={theme.colors.gray[6]}
                  mr="xl"
                />
              </MediaQuery>

              <Text>Application header</Text>
            </div>
          </Header>
        }
      >
        {/* {profile && (
          <Header
            onLogo={() => navigate('/')}
            onProfile={() => navigate(`/${getReferenceString(profile)}`)}
            onSignOut={() => {
              medplum.signOut();
              navigate('/signin');
            }}
            config={medplum.getUserConfiguration()}
          />
        )} */}
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
