import { AppShell, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconBuildingCommunity,
  IconUser,
  IconUserPlus,
  IconBuildingHospital,
  IconStethoscope,
  IconReportMedical,
  IconNurse,
  IconMessage,
  IconUpload,
  IconHome,
} from '@tabler/icons-react';
import { Suspense } from 'react';
import { ClinicPage } from './pages/AllClinicsPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientsListPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { NewClinicPage } from './pages/NewClinicPage';
import { NewClinicianPage } from './pages/NewClinicianPage';
import { ManageClinicPage } from './pages/ManageClinicPage';
import { UploadAccessPolicyPage } from './pages/UploadAccessPolicyPage';
import { UploadBundlePage } from './pages/UploadBundlePage';
import { ObservationPage } from './pages/ObservationsListPage';
import { DiagnosticReportPage } from './pages/DiagnosticReportPage';
import { EncounterPage } from './pages/EncountersListPage';
import { CommunicationPage } from './pages/CommunicationsListPage';
import { Route, Routes, Navigate } from 'react-router';

export function App(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Loading />;
  }

  return (
    <AppShell logo={<Logo size={24} />} menus={menus}>
      <Suspense fallback={<Loading />}>
        <Routes>
          {profile ? (
            <>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/" element={<LandingPage />} />
              <Route path="/Patient" element={<PatientPage />} />
              <Route path="/Organization" element={<ClinicPage />} />
              <Route path="/Organization/:id/manage" element={<ManageClinicPage />} />
              <Route path="/Observation" element={<ObservationPage />} />
              <Route path="/DiagnosticReport" element={<DiagnosticReportPage />} />
              <Route path="/Encounter" element={<EncounterPage />} />
              <Route path="/Communication" element={<CommunicationPage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
              <Route path="/Organization/new" element={<NewClinicPage />} />
              <Route path="/Practitioner/new" element={<NewClinicianPage />} />
              <Route path="/admin/access-policy" element={<UploadAccessPolicyPage />} />
              <Route path="/admin/upload-bundle" element={<UploadBundlePage />} />
            </>
          ) : (
            <>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="*" element={<Navigate to="/signin" replace />} />
            </>
          )}
        </Routes>
      </Suspense>
    </AppShell>
  );
}

const menus = [
  {
    title: 'Managed Service Organization',
    links: [
      {
        icon: <IconHome />,
        label: 'Directions',
        href: '/',
      },
    ],
  },
  {
    title: 'Upload Data',
    links: [
      {
        icon: <IconUpload />,
        label: 'Upload Access Policy',
        href: '/admin/access-policy',
      },
      {
        icon: <IconUpload />,
        label: 'Upload FHIR Bundle',
        href: '/admin/upload-bundle',
      },
    ],
  },
  {
    title: 'Management',
    links: [
      {
        icon: <IconBuildingHospital />,
        label: 'Create New Clinic',
        href: '/Organization/new',
      },
      {
        icon: <IconUserPlus />,
        label: 'Create New Clinician',
        href: '/Practitioner/new',
      },
      {
        icon: <IconBuildingCommunity />,
        label: 'Manage Clinics',
        href: '/Organization',
      },
    ],
  },
  {
    title: 'Resources',
    links: [
      {
        icon: <IconUser />,
        label: 'Patients',
        href: '/Patient',
      },
      {
        icon: <IconStethoscope />,
        label: 'Observations',
        href: '/Observation',
      },
      {
        icon: <IconReportMedical />,
        label: 'Diagnostic Reports',
        href: '/DiagnosticReport',
      },
      {
        icon: <IconNurse />,
        label: 'Encounters',
        href: '/Encounter',
      },
      {
        icon: <IconMessage />,
        label: 'Communications',
        href: '/Communication',
      },
    ],
  },
];
