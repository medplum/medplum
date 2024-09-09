import { HomerEncounter } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { EncounterTimeline } from './EncounterTimeline';

export default {
  title: 'Medplum/EncounterTimeline',
  component: EncounterTimeline,
} as Meta;

export const Encounter = (): JSX.Element => <EncounterTimeline encounter={HomerEncounter} />;
