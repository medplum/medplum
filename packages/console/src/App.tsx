import { getReferenceString } from '@medplum/core';
import {
  CssBaseline,
  DefaultTheme,
  Header,
  useMedplum,
  useMedplumRouter
} from '@medplum/ui';
import React from 'react';
import { Route, Router, Switch } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { history } from './history';
import { HomePage } from './HomePage';
import { ResourcePage } from './ResourcePage';
import { SignInPage } from './SignInPage';

export function App() {
  const medplum = useMedplum();
  const router = useMedplumRouter();
  return (
    <Router history={history}>
      <CssBaseline />
      <DefaultTheme />
      <Header
        onLogo={() => router.push('/')}
        onProfile={() => {
          const profile = medplum.getProfile();
          if (profile) {
            router.push(`/${getReferenceString(profile)}`);
          }
        }}
        onSignIn={() => router.push('/signin')}
        onSignOut={() => {
          medplum.signOut();
          router.push('/signin');
        }}
        onRegister={() => console.log('onCreateAccount')}
        sidebarLinks={[
          {
            title: 'Favorites',
            links: [
              { label: 'Device', href: '/Device' },
              { label: 'Patient', href: '/Patient' },
              { label: 'Practitioner', href: '/Practitioner' },
              { label: 'Observation', href: '/Observation' },
              { label: 'Organization', href: '/Organization' },
              { label: 'Encounter', href: '/Encounter' },
              { label: 'StructureDefinition', href: '/StructureDefinition' },
            ]
          }
        ]}
      />
      <Switch>
        <Route exact path="/signin"><SignInPage /></Route>
        <Route exact path="/:resourceType/new"><CreateResourcePage /></Route>
        <Route exact path="/:resourceType/:id/:tab?"><ResourcePage /></Route>
        <Route exact path="/:resourceType?"><HomePage /></Route>
      </Switch>
    </Router>
  );
}
