// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerEncounter } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { EncounterTimeline } from './EncounterTimeline';

export default {
  title: 'Medplum/EncounterTimeline',
  component: EncounterTimeline,
} as Meta;

export const Encounter = (): JSX.Element => <EncounterTimeline encounter={HomerEncounter} />;
