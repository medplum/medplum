import { MedplumClient } from '@medplum/core';
import {
  CssBaseline,
  DefaultTheme,
  Header,
  MedplumProvider
} from '@medplum/ui';
import React from 'react';
import { Route, Router, Switch } from 'react-router-dom';
import { CreateResourcePage } from './CreateResourcePage';
import { history } from './history';
import { HomePage } from './HomePage';
import { ProfilePage } from './ProfilePage';
import { ResourcePage } from './ResourcePage';
import { SignInPage } from './SignInPage';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL as string,
  clientId: process.env.MEDPLUM_CLIENT_ID as string,
  onUnauthenticated: () => history.push('/signin')
});

export default function App() {
  return (
    <MedplumProvider medplum={medplum} router={history}>
      <Router history={history}>
        <CssBaseline />
        <DefaultTheme />
        <Header
          onLogo={() => history.push('/')}
          onProfile={() => history.push('/profile')}
          onSignIn={() => history.push('/signin')}
          onSignOut={signOut}
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
          <Route exact path="/profile"><ProfilePage /></Route>
          <Route exact path="/:resourceType/new"><CreateResourcePage /></Route>
          <Route exact path="/:resourceType/:id/:tab?"><ResourcePage /></Route>
          <Route exact path="/:resourceType?"><HomePage /></Route>
        </Switch>
      </Router>
    </MedplumProvider>
  );
}

function signOut() {
  medplum.signOut();
  history.push('/signin');
}
