import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconMedicineSyrup, IconReportMedical, IconRobot, IconUser } from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PHOTON_CLIENT_ID, PHOTON_ORG_ID } from './config';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { PrescriptionPage } from './pages/PrescriptionPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';
import '@photonhealth/elements';
import { MedicationsPage } from './pages/MedicationsPage';
import { MedicationPage } from './pages/MedicationPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <photon-client id={PHOTON_CLIENT_ID} org={PHOTON_ORG_ID} dev-mode="true" auto-login="true">
      <AppShell
        logo={<Logo size={24} />}
        menus={[
          {
            title: 'My Links',
            links: [
              { icon: <IconUser />, label: 'Patients', href: '/' },
              { icon: <IconMedicineSyrup />, label: 'Formulary', href: '/MedicationKnowledge' },
            ],
          },
          {
            title: 'Upload Data',
            links: [
              { icon: <IconRobot />, label: 'Upload Bots', href: '/upload/bots' },
              { icon: <IconReportMedical />, label: 'Upload Formulary', href: '/upload/formulary' },
            ],
          },
        ]}
      >
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={profile ? <HomePage /> : <LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/Patient/:id/*" element={<PatientPage />} />
              <Route path="/MedicationRequest/:id/*" element={<PrescriptionPage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
              <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
              <Route path="/upload/:dataType" element={<UploadDataPage />} />
              <Route path="/MedicationKnowledge" element={<MedicationsPage />} />
              <Route path="/MedicationKnowledge/:id/*" element={<MedicationPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </photon-client>
  );
}
