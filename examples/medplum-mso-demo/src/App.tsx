import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { 
  IconBuildingCommunity, 
  IconUser, 
  IconUserCircle, 
  IconUserPlus, 
  IconBuildingHospital 
} from '@tabler/icons-react';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { OrganizationPage } from './pages/OrganizationPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { PractitionerPage } from './pages/PractitionerPage';
import { ResourcePage } from './pages/ResourcePage';
import { SignInPage } from './pages/SignInPage';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { NewOrganizationPage } from './pages/NewOrganizationPage';
import { NewClinicianPage } from './pages/NewClinicianPage';
import { ManageOrganizationPage } from './pages/ManageOrganizationPage';
export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Management',
          links: [
            { 
              icon: <IconBuildingHospital />, 
              label: 'Create New Organization', 
              href: '/Organization/new' 
            },
            { 
              icon: <IconUserPlus />, 
              label: 'Create New Clinician', 
              href: '/Practitioner/new' 
            },
            { 
              icon: <IconUserPlus />, 
              label: 'Enrollment', 
              href: '/admin/enrollment' 
            },
            { icon: <IconBuildingCommunity />,
              label: 'Manage Organizations', 
              href: '/Organization' },

          ]
        },
        {
          title: 'Resources',
          links: [
            { icon: <IconUser />,
               label: 'Patients', 
               href: '/Patient' 
            },
            { icon: <IconUserCircle />, 
              label: 'Practitioners', 
              href: '/Practitioner' 
            },
          ],
        },
      ]}
    >
      <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/signin" element={<SignInPage />} />
            <Route path="/" element={profile ? <OrganizationPage /> : <SignInPage />} />
            
            {/* Main resource routes */}
            <Route path="/Patient" element={profile ? <PatientPage /> : <LandingPage />} />
            <Route path="/Organization" element={profile ? <OrganizationPage /> : <LandingPage />} />
            <Route path="/Organization/:id/manage" element={profile ? <ManageOrganizationPage /> : <LandingPage />} />
            <Route path="/Practitioner" element={profile ? <PractitionerPage /> : <LandingPage />} />
            
            {/* Admin routes */}
            <Route path="/admin/enrollment" element={profile ? <EnrollmentPage /> : <LandingPage />} />
            
            {/* Generic resource route */}
            <Route path="/:resourceType/:id" element={<ResourcePage />} />

            {/* New Clinic route */}
            <Route path="/Organization/new" element={profile ? <NewOrganizationPage /> : <LandingPage />} />

            {/* New Clinician route */}
            <Route path="/Practitioner/new" element={profile ? <NewClinicianPage /> : <LandingPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
