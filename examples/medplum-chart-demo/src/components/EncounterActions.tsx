// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { Encounter } from '@medplum/fhirtypes';
import { JSX } from 'react';
import { EditType } from './actions/EditType';

interface EncounterActionsProps {
  encounter: Encounter;
  onChange: (encounter: Encounter) => void;
}

export function EncounterActions(props: EncounterActionsProps): JSX.Element {
  return (
    <Stack p="xs" m="xs">
      <Title>Encounter Actions</Title>
      <EditType encounter={props.encounter} onChange={props.onChange} />
    </Stack>
  );
}
