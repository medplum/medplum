import { HomerEncounter } from '@medplum/mock';
import { Meta } from '@storybook/react';
import React from 'react';
import { EncounterTimeline } from './EncounterTimeline';

export default {
  title: 'Medplum/EncounterTimeline',
  component: EncounterTimeline,
} as Meta;

export const Encounter = (): JSX.Element => (
  <EncounterTimeline encounter={HomerEncounter} options={{ cache: 'reload' }} />
);
