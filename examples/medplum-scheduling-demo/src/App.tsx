// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString } from '@medplum/core';
import { Practitioner, Schedule } from '@medplum/fhirtypes';
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconCalendar,
  IconClipboard,
  IconDatabaseImport,
  IconHealthRecognition,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { JSX, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppointmentDetailPage } from './pages/AppointmentDetailPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { PatientSchedulePage } from './pages/PatientSchedulePage';
import { ResourcePage } from './pages/ResourcePage';
import { SchedulePage } from './pages/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';
import { ScheduleContext } from './Schedule.context';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [schedule, setSchedule] = useState<Schedule | undefined>();

  useEffect(() => {
    if (medplum.isLoading() || !profile) {
      return;
    }

    // Search for a Schedule associated with the logged user,
    // create one if it doesn't exist
    medplum
      .searchOne('Schedule', { actor: getReferenceString(profile) })
      .then((foundSchedule) => {
        if (foundSchedule) {
          setSchedule(foundSchedule);
        } else {
          medplum
            .createResource({
              resourceType: 'Schedule',
              actor: [createReference(profile)],
              active: true,
            })
            .then(setSchedule)
            .catch((err) => {
              console.log(err);
            });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }, [medplum, profile]);

  if (medplum.isLoading()) {
    return <Loading />;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Charts',
          links: [{ icon: <IconUser />, label: 'Patients', href: '/Patient' }],
        },
        {
          title: 'Schedule',
          links: [
            {
              icon: <IconCalendar />,
              label: 'My Schedule',
              href: '/Schedule',
            },
            {
              icon: <IconClipboard />,
              label: 'My Appointments',
              href: '/Appointment/upcoming',
            },
          ],
        },
        {
          title: 'Upload Data',
          links: [
            { icon: <IconDatabaseImport />, label: 'Upload Core ValueSets', href: '/upload/core' },
            { icon: <IconRobot />, label: 'Upload Example Bots', href: '/upload/bots' },
            { icon: <IconHealthRecognition />, label: 'Upload Example Data', href: '/upload/example' },
          ],
        },
      ]}
    >
      <ScheduleContext.Provider value={{ schedule: schedule }}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={profile ? <Navigate to="/Schedule" /> : <LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/Schedule" element={schedule ? <Navigate to={`/Schedule/${schedule.id}`} /> : <Loading />} />
              <Route path="/Schedule/:id" element={schedule ? <SchedulePage /> : <Loading />} />
              <Route
                path="/Patient/:patientId/Schedule/:scheduleId"
                element={schedule ? <PatientSchedulePage /> : <Loading />}
              />
              <Route path="/Patient/:id" element={<PatientPage />}>
                <Route index element={<PatientPage />} />
                <Route path="*" element={<PatientPage />} />
              </Route>
              <Route path="/Appointment/upcoming" element={<AppointmentsPage />} />
              <Route path="/Appointment/past" element={<AppointmentsPage />} />
              <Route path="/Appointment/:id" element={<AppointmentDetailPage />}>
                <Route index element={<AppointmentDetailPage />} />
                <Route path="*" element={<AppointmentDetailPage />} />
              </Route>
              <Route path="/upload/:dataType" element={<UploadDataPage />} />
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />}>
                <Route index element={<ResourcePage />} />
                <Route path="*" element={<ResourcePage />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </ScheduleContext.Provider>
    </AppShell>
  );
}
