import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { BotsPage } from './admin/BotsPage';
import { ClientsPage } from './admin/ClientsPage';
import { CreateBotPage } from './admin/CreateBotPage';
import { CreateClientPage } from './admin/CreateClientPage';
import { EditMembershipPage } from './admin/EditMembershipPage';
import { InvitePage } from './admin/InvitePage';
import { PatientsPage } from './admin/PatientsPage';
import { ProjectDetailsPage } from './admin/ProjectDetailsPage';
import { ProjectPage } from './admin/ProjectPage';
import { SecretsPage } from './admin/SecretsPage';
import { SitesPage } from './admin/SitesPage';
import { SuperAdminPage } from './admin/SuperAdminPage';
import { UsersPage } from './admin/UsersPage';
import { BatchPage } from './BatchPage';
import { BulkAppPage } from './BulkAppPage';
import { ChangePasswordPage } from './ChangePasswordPage';
import { CreateResourcePage } from './CreateResourcePage';
import { ErrorPage } from './ErrorPage';
import { FormPage } from './FormPage';
import { HomePage } from './HomePage';
import { AssaysPage } from './lab/AssaysPage';
import { PanelsPage } from './lab/PanelsPage';
import { MfaPage } from './MfaPage';
import { OAuthPage } from './OAuthPage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { ApplyPage } from './resource/ApplyPage';
import { AppsPage } from './resource/AppsPage';
import { BlamePage } from './resource/BlamePage';
import { BotEditor } from './resource/BotEditor';
import { BuilderPage } from './resource/BuilderPage';
import { ChecklistPage } from './resource/ChecklistPage';
import { DeletePage } from './resource/DeletePage';
import { DetailsPage } from './resource/DetailsPage';
import { EditPage } from './resource/EditPage';
import { HistoryPage } from './resource/HistoryPage';
import { JsonPage } from './resource/JsonPage';
import { PreviewPage } from './resource/PreviewPage';
import { QuestionnaireBotsPage } from './resource/QuestionnaireBotsPage';
import { ReferenceRangesPage } from './resource/ReferenceRangesPage';
import { ReportPage } from './resource/ReportPage';
import { ResourcePage } from './resource/ResourcePage';
import { ResourceVersionPage } from './resource/ResourceVersionPage';
import { TimelinePage } from './resource/TimelinePage';
import { SecurityPage } from './SecurityPage';
import { SetPasswordPage } from './SetPasswordPage';
import { SignInPage } from './SignInPage';
import { SmartSearchPage } from './SmartSearchPage';

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route errorElement={<ErrorPage />}>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/oauth" element={<OAuthPage />} />
        <Route path="/resetpassword" element={<ResetPasswordPage />} />
        <Route path="/setpassword/:id/:secret" element={<SetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/changepassword" element={<ChangePasswordPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/mfa" element={<MfaPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/bulk/:resourceType" element={<BulkAppPage />} />
        <Route path="/smart" element={<SmartSearchPage />} />
        <Route path="/forms/:id" element={<FormPage />} />
        <Route path="/admin/super" element={<SuperAdminPage />} />
        <Route path="/admin" element={<ProjectPage />}>
          <Route path="patients" element={<PatientsPage />} />
          <Route path="bots/new" element={<CreateBotPage />} />
          <Route path="bots" element={<BotsPage />} />
          <Route path="clients/new" element={<CreateClientPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="details" element={<ProjectDetailsPage />} />
          <Route path="invite" element={<InvitePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="project" element={<ProjectDetailsPage />} />
          <Route path="secrets" element={<SecretsPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="members/:membershipId" element={<EditMembershipPage />} />
        </Route>
        <Route path="/lab/assays" element={<AssaysPage />} />
        <Route path="/lab/panels" element={<PanelsPage />} />
        <Route path="/:resourceType/:id/_history/:versionId/:tab" element={<ResourceVersionPage />} />
        <Route path="/:resourceType/:id/_history/:versionId" element={<ResourceVersionPage />} />
        <Route path="/:resourceType/new" element={<CreateResourcePage />} />
        <Route path="/:resourceType/:id" element={<ResourcePage />}>
          <Route index element={<TimelinePage />} />
          <Route path="apply" element={<ApplyPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="blame" element={<BlamePage />} />
          <Route path="bots" element={<QuestionnaireBotsPage />} />
          <Route path="builder" element={<BuilderPage />} />
          <Route path="checklist" element={<ChecklistPage />} />
          <Route path="delete" element={<DeletePage />} />
          <Route path="details" element={<DetailsPage />} />
          <Route path="edit" element={<EditPage />} />
          <Route path="editor" element={<BotEditor />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="json" element={<JsonPage />} />
          <Route path="preview" element={<PreviewPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="ranges" element={<ReferenceRangesPage />} />
          <Route path="timeline" element={<TimelinePage />} />
        </Route>
        <Route path="/:resourceType" element={<HomePage />} />
        <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
