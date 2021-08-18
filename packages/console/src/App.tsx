import { getReferenceString } from '@medplum/core';
import {
  CssBaseline,
  DefaultTheme,
  FooterLinks,
  Header,
  MedplumLink,
  useMedplum,
  useMedplumRouter
} from '@medplum/ui';
import React from 'react';
import { Route, Router, Switch } from 'react-router-dom';
import { ChangePasswordPage } from './ChangePasswordPage';
import { CreateResourcePage } from './CreateResourcePage';
import { history } from './history';
import { HomePage } from './HomePage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { ResourcePage } from './ResourcePage';
import { SignInPage } from './SignInPage';

export function App() {
  const medplum = useMedplum();
  const router = useMedplumRouter();
  const profile = medplum.getProfile();
  return (
    <Router history={history}>
      <CssBaseline />
      <DefaultTheme />
      {profile && (
        <Header
          onLogo={() => router.push('/')}
          onProfile={() => router.push(`/${getReferenceString(profile)}`)}
          onSignOut={() => {
            medplum.signOut();
            router.push('/signin');
          }}
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
            },
            {
              title: 'Admin',
              links: [
                { label: 'User', href: '/User' },
                { label: 'Project', href: '/Project' },
                { label: 'ProjectMembership', href: '/ProjectMembership' }
              ]
            },
            {
              title: 'Settings',
              links: [
                { label: 'Change Password', href: '/changepassword' },
                { label: 'Client Applications', href: '/Project' },
                { label: 'Projects', href: '/ProjectMembership' }
              ]
            }
          ]}
        />
      )}
      <Switch>
        <Route exact path="/signin"><SignInPage /></Route>
        <Route exact path="/resetpassword"><ResetPasswordPage /></Route>
        <Route exact path="/register"><RegisterPage /></Route>
        <Route exact path="/changepassword"><ChangePasswordPage /></Route>
        <Route exact path="/:resourceType/new"><CreateResourcePage /></Route>
        <Route exact path="/:resourceType/:id/:tab?"><ResourcePage /></Route>
        <Route exact path="/:resourceType?"><HomePage /></Route>
      </Switch>
      {!profile && (
        <FooterLinks>
          <MedplumLink to="/help">Help</MedplumLink>
          <MedplumLink to="/terms">Terms</MedplumLink>
          <MedplumLink to="/privacy">Privacy</MedplumLink>
        </FooterLinks>
      )}
    </Router>
  );
}
