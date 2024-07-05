import { Navigate, Route, Routes } from 'react-router-dom';
import { AccountPage } from './pages/account';
import { MembershipAndBilling } from './pages/account/MembershipAndBilling';
import { Profile } from './pages/account/Profile';
import { Provider } from './pages/account/Provider';
import { CarePlanPage } from './pages/care-plan';
import { ActionItem } from './pages/care-plan/ActionItem';
import { ActionItems } from './pages/care-plan/ActionItems';
import { GetCare } from './pages/GetCarePage';
import { HealthRecord } from './pages/health-record';
import { LabResult } from './pages/health-record/LabResult';
import { LabResults } from './pages/health-record/LabResults';
import { Measurement } from './pages/health-record/Measurement';
import { Medication } from './pages/health-record/Medication';
import { Medications } from './pages/health-record/Medications';
import { Responses } from './pages/health-record/Responses';
import { Response } from './pages/health-record/Response';
import { Vaccine } from './pages/health-record/Vaccine';
import { Vaccines } from './pages/health-record/Vaccines';
import { Vitals } from './pages/health-record/Vitals';
import { HomePage } from './pages/HomePage';
import { MessageTable } from './pages/MessageTablePage';
import { Messages } from './pages/MessagesPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { ObservationPage } from './pages/ObservationPage';
import { SignOutPage } from './pages/SignOutPage';

export function Router(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="messages/" element={<MessageTable />} />
      <Route path="messages/:practitionerId" element={<Messages />} />
      <Route path="Questionnaire/:questionnaireId" element={<QuestionnairePage />} />
      <Route path="health-record/*" element={<HealthRecord />}>
        <Route index element={<Navigate replace to="/health-record/lab-results" />} />
        <Route path="lab-results/*" element={<LabResults />} />
        <Route path="lab-results/:resultId" element={<LabResult />} />
        <Route path="medications" element={<Medications />} />
        <Route path="medications/:medicationId" element={<Medication />} />
        <Route path="questionnaire-responses" element={<Responses />} />
        <Route path="questionnaire-responses/:responseId" element={<Response />} />
        <Route path="vaccines" element={<Vaccines />} />
        <Route path="vaccines/:vaccineId" element={<Vaccine />} />
        <Route path="vitals" element={<Vitals />} />
        <Route path="vitals/:measurementId" element={<Measurement />} />
      </Route>
      <Route path="Observation/:observationId" element={<ObservationPage />} />
      <Route path="care-plan/*" element={<CarePlanPage />}>
        <Route index element={<Navigate replace to="/care-plan/action-items" />} />
        <Route path="action-items" element={<ActionItems />} />
        <Route path="action-items/:itemId" element={<ActionItem />} />
      </Route>
      <Route path="get-care/*" element={<GetCare />} />
      <Route path="account/*" element={<AccountPage />}>
        <Route index element={<Navigate replace to="/account/profile" />} />
        <Route path="profile" element={<Profile />} />
        <Route path="provider/*" element={<Provider />} />
        <Route path="membership-and-billing" element={<MembershipAndBilling />} />
      </Route>
      <Route path="signout" element={<SignOutPage />} />
    </Routes>
  );
}
