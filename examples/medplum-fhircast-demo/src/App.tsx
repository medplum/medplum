import { createStyles } from '@mantine/core';
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import MainPage from './components/MainPage';
import Publisher from './components/Publisher';
import Redirect from './components/Redirect';
import SignInPage from './components/SignInPage';
import Subscriber from './components/Subscriber';

const useStyles = createStyles((theme) => ({
  root: {
    padding: '15px 30px',
    background: theme.white,
  },
}));

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const location = useLocation();
  const profile = useMedplumProfile();

  const { classes } = useStyles();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Apps',
          links: [
            { icon: <IconUser />, label: 'Publisher', href: '/publisher' },
            { icon: <IconUser />, label: 'Subscriber', href: '/subscriber' },
          ],
        },
      ]}
    >
      <div className={classes.root}>
        <ErrorBoundary key={location.key}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={!profile ? <LandingPage /> : <MainPage />} />
              <Route path="/signin" element={!profile ? <SignInPage /> : <Redirect path="/" />} />
              <Route path="/publisher" element={<Publisher />} />
              <Route path="/subscriber" element={<Subscriber />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </AppShell>
  );
}

export default App;
