import { Container, Group } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Loading } from '../../components/Loading';
import { SideMenu } from '../../components/SideMenu';
import { measurementsMeta } from './Measurement.data';

const sideMenu = {
  title: 'Health Record',
  menu: [
    { name: 'Lab Results', href: '/health-record/lab-results' },
    { name: 'Medications', href: '/health-record/medications' },
    { name: 'Questionnaire Responses', href: '/health-record/questionnaire-responses' },
    { name: 'Vaccines', href: '/health-record/vaccines' },
    {
      name: 'Vitals',
      href: '/health-record/vitals',
      subMenu: Object.values(measurementsMeta).map(({ title, id }) => ({
        name: title,
        href: `/health-record/vitals/${id}`,
      })),
    },
  ],
};

export function HealthRecord(): JSX.Element {
  return (
    <Container>
      <Group align="top">
        <SideMenu {...sideMenu} />
        <div style={{ width: 800, flex: 800 }}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
