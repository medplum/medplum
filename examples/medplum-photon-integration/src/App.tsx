// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import '@photonhealth/elements';
import { IconMedicineSyrup, IconReportMedical, IconRobot, IconUser } from '@tabler/icons-react';
import { JSX, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { getConfig } from './config';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { MedicationPage } from './pages/MedicationPage';
import { MedicationsPage } from './pages/MedicationsPage';
import { PatientPage } from './pages/PatientPage';
import { PrescriptionPage } from './pages/PrescriptionPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <photon-client id={getConfig().photonClientId} org={getConfig().photonOrgId} dev-mode="true" auto-login="true">
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
              <Route path="/Patient/:id">
                <Route index element={<PatientPage />} />
                <Route path="*" element={<PatientPage />} />
              </Route>
              <Route path="/MedicationRequest/:id">
                <Route index element={<PrescriptionPage />} />
                <Route path="*" element={<PrescriptionPage />} />
              </Route>
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
              <Route path="/:resourceType/:id/_history/:versionId" element={<ResourcePage />} />
              <Route path="/upload/:dataType" element={<UploadDataPage />} />
              <Route path="/MedicationKnowledge" element={<MedicationsPage />} />
              <Route path="/MedicationKnowledge/:id">
                <Route index element={<MedicationPage />} />
                <Route path="*" element={<MedicationPage />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </photon-client>
  );
}
