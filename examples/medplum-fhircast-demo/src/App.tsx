import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconMessage2Down, IconMessage2Plus, IconSquareRoundedArrowRight } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import classes from './App.module.css';
import DemoInstructionsPage from './components/DemoInstructionsPage';
import LandingPage from './components/LandingPage';
import Publisher from './components/Publisher';
import Redirect from './components/Redirect';
import SignInPage from './components/SignInPage';
import Subscriber from './components/Subscriber';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={
        profile
          ? [
              {
                title: 'Info',
                links: [{ icon: <IconSquareRoundedArrowRight />, label: 'Running the demo', href: '/' }],
              },
              {
                title: 'Apps',
                links: [
                  { icon: <IconMessage2Plus />, label: 'Publisher', href: '/publisher' },
                  { icon: <IconMessage2Down />, label: 'Subscriber', href: '/subscriber' },
                ],
              },
            ]
          : []
      }
      headerSearchDisabled={true}
      resourceTypeSearchDisabled={true}
    >
      <div className={classes.root}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={!profile ? <LandingPage /> : <DemoInstructionsPage />} />
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
