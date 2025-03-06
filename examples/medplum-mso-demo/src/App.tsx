import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconBuildingCommunity, IconUser, IconUserCircle, IconUserPlus, IconBuildingHospital, IconStethoscope, IconReportMedical, IconNurse, IconMessage, IconUpload, IconHome } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { OrganizationPage } from './pages/OrganizationPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { PractitionerPage } from './pages/PractitionerPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { NewOrganizationPage } from './pages/NewOrganizationPage';
import { NewClinicianPage } from './pages/NewClinicianPage';
import { ManageOrganizationPage } from './pages/ManageOrganizationPage';
import { UploadAccessPolicyPage } from './pages/UploadAccessPolicyPage';
import { ObservationPage } from './pages/ObservationPage';
import { DiagnosticReportPage } from './pages/DiagnosticReportPage';
import { EncounterPage } from './pages/EncounterPage';
import { CommunicationPage } from './pages/CommunicationPage';
import { Route, Routes, Navigate } from 'react-router';


export function App(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Loading />;
  }

  // Define all menus
  const menus = [
    { 
      title: 'Managed Service Organization',
      links: [
      {
        icon: <IconHome />,
        label: 'Directions',
        href: '/'
      }
    ]
   },
   {
    title: 'Upload Data',
    links: [
      { 
        icon: <IconUpload />,
        label: 'Upload Access Policy', 
        href: '/admin/access-policy' 
      },
    ]
  },
    {
      title: 'Management',
      links: [
      { 
        icon: <IconBuildingHospital />, 
        label: 'Create New Clinic', 
        href: '/Organization/new' 
      },
      { 
        icon: <IconUserPlus />, 
        label: 'Create New Clinician', 
        href: '/Practitioner/new' 
      },
      { 
        icon: <IconBuildingCommunity />,
        label: 'Manage Clinics', 
        href: '/Organization' 
      },
    ]
  },
  {
    title: 'Resources',
    links: [
        { 
        icon: <IconUser />,
        label: 'Patients', 
        href: '/Patient' 
      },
      { 
        icon: <IconUserCircle />, 
        label: 'Clinicians', 
        href: '/Practitioner' 
      },
      { 
        icon: <IconStethoscope />,
        label: 'Observations',
        href: '/Observation'
      },
      { 
        icon: <IconReportMedical />,
        label: 'Diagnostic Reports',
        href: '/DiagnosticReport'
      },
      { 
        icon: <IconNurse />,
        label: 'Encounters',
        href: '/Encounter'
      },
      { 
        icon: <IconMessage />,
        label: 'Communications',
        href: '/Communication'
      },
    ],
  },
  ];


  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={menus}
      >

          <Suspense fallback={<Loading />}>
            <Routes>
              { profile ? (
                <>
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/Patient" element={<PatientPage />} />
                  <Route path="/Organization" element={<OrganizationPage />} />
                  <Route path="/Organization/:id/manage" element={<ManageOrganizationPage />} />
                  <Route path="/Practitioner" element={<PractitionerPage />} />
                  <Route path="/Observation" element={<ObservationPage />} />
                  <Route path="/DiagnosticReport" element={<DiagnosticReportPage />} />
                  <Route path="/Encounter" element={<EncounterPage />} />
                  <Route path="/Communication" element={<CommunicationPage />} />
                  <Route path="/:resourceType/:id" element={<ResourcePage />} />
                  <Route path="/Organization/new" element={<NewOrganizationPage />} />
                  <Route path="/Practitioner/new" element={<NewClinicianPage />} />
                  <Route path="/admin/access-policy" element={<UploadAccessPolicyPage />} />
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
