import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconUser, IconClipboard, IconCalendar } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { AppointmentDetailPage } from './pages/AppointmentDetailPage';
import { SchedulePage } from './pages/SchedulePage';
import { Practitioner, Schedule } from '@medplum/fhirtypes';
import { createReference, getReferenceString } from '@medplum/core';
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
              label: 'Schedule',
              href: '/Schedule',
            },
            {
              icon: <IconClipboard />,
              label: 'Appointments',
              href: '/Appointment/upcoming',
            },
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
              <Route path="/Patient/:id/*" element={<PatientPage />} />
              <Route path="/Appointment/upcoming" element={<AppointmentsPage />} />
              <Route path="/Appointment/past" element={<AppointmentsPage />} />
              <Route path="/Appointment/:id/*" element={<AppointmentDetailPage />} />
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </ScheduleContext.Provider>
    </AppShell>
  );
}
