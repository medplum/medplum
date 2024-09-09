import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { PatientSummary } from './PatientSummary';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
} as Meta;

export const Patient = (): JSX.Element => (
  <PatientSummary patient={HomerSimpson} w={350} withBorder padding="lg" radius="md" mx="md" my="xl" shadow="xs" />
);

export const BackgroundImage = (): JSX.Element => (
  <PatientSummary
    patient={HomerSimpson}
    w={350}
    withBorder
    padding="lg"
    radius="md"
    mx="md"
    my="xl"
    shadow="xs"
    background="url(https://images.unsplash.com/photo-1535961652354-923cb08225a7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8bmF0dXJlJTIwc21hbGx8ZW58MHwwfDB8fHww&auto=format&fit=crop&w=800&q=60)"
  />
);

export const CustomLinkStyle = (): JSX.Element => (
  <PatientSummary
    patient={HomerSimpson}
    w={350}
    withBorder
    padding="lg"
    radius="md"
    mx="md"
    my="xl"
    shadow="xs"
    appointmentsUrl="/my-custom-appointments-page"
    encountersUrl={undefined}
  />
);
