import { getReferenceString } from '@medplum/core';
import {
  CssBaseline,
  DefaultTheme,
  FooterLinks,
  Header,
  useMedplum,
  useMedplumProfile,
  useMedplumRouter
} from '@medplum/ui';
import React from 'react';
import { Route, Router, Switch } from 'react-router-dom';
import { EditMembershipPage } from './admin/EditMembershipPage';
import { InvitePage } from './admin/InvitePage';
import { ProjectPage } from './admin/ProjectPage';
import { ProjectsPage } from './admin/ProjectsPage';
import { ChangePasswordPage } from './ChangePasswordPage';
import { CreateResourcePage } from './CreateResourcePage';
import { FormPage } from './FormPage';
import { history } from './history';
import { HomePage } from './HomePage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { ResourcePage } from './ResourcePage';
import { SetPasswordPage } from './SetPasswordPage';
import { SignInPage } from './SignInPage';

export function App() {
  const medplum = useMedplum();
  const router = useMedplumRouter();
  const profile = useMedplumProfile();
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
                { label: 'Patients', href: '/Patient' },
                { label: 'Practitioners', href: '/Practitioner' },
                { label: 'Observations', href: '/Observation' },
                { label: 'Organizations', href: '/Organization' },
                { label: 'Service Requests', href: '/ServiceRequest' },
                { label: 'Encounters', href: '/Encounter' },
                { label: 'Diagnostic Reports', href: '/DiagnosticReport' },
                { label: 'Questionnaires', href: '/Questionnaire' },
              ]
            },
            {
              title: 'Admin',
              links: [
                { label: 'Projects', href: '/admin/projects' },
                { label: 'AccessPolicy', href: '/AccessPolicy' }
              ]
            },
            {
              title: 'Developer',
              links: [
                { label: 'Client Applications', href: '/ClientApplication' },
                { label: 'Subscriptions', href: '/Subscription' },
                { label: 'Bots', href: '/Bot' }
              ]
            },
            {
              title: 'Settings',
              links: [
                { label: 'Profile', href: `/${profile.resourceType}/${profile.id}` },
                { label: 'Change Password', href: '/changepassword' }
              ]
            }
          ]}
        />
      )}
      <Switch>
        <Route exact path="/signin"><SignInPage /></Route>
        <Route exact path="/resetpassword"><ResetPasswordPage /></Route>
        <Route exact path="/setpassword/:id/:secret"><SetPasswordPage /></Route>
        <Route exact path="/register"><RegisterPage /></Route>
        <Route exact path="/changepassword"><ChangePasswordPage /></Route>
        <Route exact path="/forms/:id"><FormPage /></Route>
        <Route exact path="/admin/projects"><ProjectsPage /></Route>
        <Route exact path="/admin/projects/:id"><ProjectPage /></Route>
        <Route exact path="/admin/projects/:id/invite"><InvitePage /></Route>
        <Route exact path="/admin/projects/:projectId/members/:membershipId"><EditMembershipPage /></Route>
        <Route exact path="/:resourceType/new"><CreateResourcePage /></Route>
        <Route exact path="/:resourceType/:id/:tab?"><ResourcePage /></Route>
        <Route exact path="/:resourceType?"><HomePage /></Route>
      </Switch>
      {!profile && (
        <FooterLinks>
          <a href="https://www.medplum.com/privacy">Terms</a>
          <a href="https://www.medplum.com/privacy">Privacy</a>
        </FooterLinks>
      )}
    </Router>
  );
}
