import { MedplumClient } from 'medplum';
import {
  CssBaseline,
  DefaultTheme,
  Header,
  MedplumProvider
} from 'medplum-ui';
import React from 'react';
import { Route, Router, Switch } from 'react-router-dom';
import { history } from './history';
import { HomePage } from './HomePage';
import { ProfilePage } from './ProfilePage';
import { ResourcePage } from './ResourcePage';
import { SignInPage } from './SignInPage';
import { TestPage } from './TestPage';

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL as string,
  clientId: process.env.MEDPLUM_CLIENT_ID as string,
});

export default function App() {
  return (
    <MedplumProvider medplum={medplum}>
      <Router history={history}>
        <CssBaseline />
        <DefaultTheme />
        <Header
          onLogo={() => history.push('/')}
          onProfile={() => history.push('/profile')}
          onSignIn={() => history.push('/signin')}
          onRegister={() => console.log('onCreateAccount')}
        />
        <Switch>
          <Route exact path="/"><HomePage /></Route>
          <Route exact path="/test"><TestPage /></Route>
          <Route exact path="/signin"><SignInPage /></Route>
          <Route exact path="/profile"><ProfilePage /></Route>
          <Route exact path="/:resourceType/:id"><ResourcePage /></Route>
        </Switch>
      </Router>
    </MedplumProvider>
  );
}
