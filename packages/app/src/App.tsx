import { getReferenceString } from '@medplum/core';
import { FooterLinks, Header, Loading, useMedplum, useMedplumProfile } from '@medplum/ui';
import React from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { CreateBotPage } from './admin/CreateBotPage';
import { CreateClientPage } from './admin/CreateClientPage';
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
import '@medplum/ui/defaulttheme.css';
import '@medplum/ui/styles.css';
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
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/resetpassword" element={<ResetPasswordPage />} />
        <Route path="/setpassword/:id/:secret" element={<SetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/changepassword" element={<ChangePasswordPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/forms/:id" element={<FormPage />} />
        <Route path="/admin/project" element={<ProjectPage />} />
        <Route path="/admin/projects/:projectId/bot" element={<CreateBotPage />} />
        <Route path="/admin/projects/:projectId/client" element={<CreateClientPage />} />
        <Route path="/admin/projects/:projectId/invite" element={<InvitePage />} />
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
