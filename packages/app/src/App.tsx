import { getReferenceString } from '@medplum/core';
import { CssBaseline, DefaultTheme, FooterLinks, Header, Loading, useMedplum, useMedplumProfile } from '@medplum/ui';
import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { EditMembershipPage } from './admin/EditMembershipPage';
import { InvitePage } from './admin/InvitePage';
import { ProjectPage } from './admin/ProjectPage';
import { SuperAdminPage } from './admin/SuperAdminPage';
import { BatchPage } from './BatchPage';
import { ChangePasswordPage } from './ChangePasswordPage';
import { CreateResourcePage } from './CreateResourcePage';
import { FormPage } from './FormPage';
import { HomePage } from './HomePage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { ResourcePage } from './ResourcePage';
import { ResourceVersionPage } from './ResourceVersionPage';
import { SetPasswordPage } from './SetPasswordPage';
import { SignInPage } from './SignInPage';
import './App.css';

export function App(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return (
      <>
        <CssBaseline />
        <DefaultTheme />
        <Loading />
      </>
    );
  }

  return (
    <>
      <CssBaseline />
      <DefaultTheme />
      {profile && (
        <Header
          onLogo={() => navigate('/')}
          onProfile={() => navigate(`/${getReferenceString(profile)}`)}
          onSignOut={() => {
            medplum.signOut();
            navigate('/signin');
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
              ],
            },
            {
              title: 'Admin',
              links: [
                { label: 'Project', href: '/admin/project' },
                { label: 'AccessPolicy', href: '/AccessPolicy' },
              ],
            },
            {
              title: 'Developer',
              links: [
                { label: 'Client Applications', href: '/ClientApplication' },
                { label: 'Subscriptions', href: '/Subscription' },
                { label: 'Bots', href: '/Bot' },
                { label: 'Batch', href: '/batch' },
              ],
            },
            {
              title: 'Settings',
              links: [
                {
                  label: 'Profile',
                  href: `/${profile.resourceType}/${profile.id}`,
                },
                { label: 'Change Password', href: '/changepassword' },
              ],
            },
          ]}
        />
      )}
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/resetpassword" element={<ResetPasswordPage />} />
        <Route path="/setpassword/:id/:secret" element={<SetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/changepassword" element={<ChangePasswordPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/forms/:id" element={<FormPage />} />
        <Route path="/admin/project" element={<ProjectPage />} />
        <Route path="/admin/projects/:id/invite" element={<InvitePage />} />
        <Route path="/admin/projects/:projectId/members/:membershipId" element={<EditMembershipPage />} />
        <Route path="/admin/super" element={<SuperAdminPage />} />
        <Route path="/:resourceType/:id/_history/:versionId/:tab" element={<ResourceVersionPage />} />
        <Route path="/:resourceType/:id/_history/:versionId" element={<ResourceVersionPage />} />
        <Route path="/:resourceType/new" element={<CreateResourcePage />} />
        <Route path="/:resourceType/:id/:tab" element={<ResourcePage />} />
        <Route path="/:resourceType/:id" element={<ResourcePage />} />
        <Route path="/:resourceType" element={<HomePage />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
      {!profile && (
        <FooterLinks>
          <a href="https://www.medplum.com/privacy">Terms</a>
          <a href="https://www.medplum.com/privacy">Privacy</a>
        </FooterLinks>
      )}
    </>
  );
}
