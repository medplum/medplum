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
import { TestPage } from './TestPage';
import { SignInPage } from './SignInPage';

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
          onSignIn={() => console.log('onLogin')}
          onRegister={() => console.log('onCreateAccount')}
        />
        <Switch>
          <Route path="/test"><TestPage /></Route>
          <Route path="/signin"><SignInPage /></Route>
        </Switch>
      </Router>
    </MedplumProvider>
  );
}
