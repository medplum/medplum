import { getReferenceString } from '@medplum/core';
import { ErrorBoundary, FooterLinks, Header, Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slide, ToastContainer } from 'react-toastify';
import { AppRoutes } from './AppRoutes';
import '@medplum/react/defaulttheme.css';
import '@medplum/react/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

export function App(): JSX.Element {
  const navigate = useNavigate();
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
      {profile && (
        <Header
          onLogo={() => navigate('/')}
          onProfile={() => navigate(`/${getReferenceString(profile)}`)}
          onSignOut={() => {
            medplum.signOut();
            navigate('/signin');
          }}
          config={medplum.getUserConfiguration()}
        />
      )}
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
      {!profile && (
        <FooterLinks>
          <a href="https://www.medplum.com/privacy">Terms</a>
          <a href="https://www.medplum.com/privacy">Privacy</a>
        </FooterLinks>
      )}
    </>
  );
}
