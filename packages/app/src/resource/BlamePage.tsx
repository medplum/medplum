// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container } from '@mantine/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Panel, ResourceBlame, useMedplum } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function BlamePage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const history = medplum.readHistory(resourceType, id).read();

  return (
    <Container maw={1200}>
      <Panel>
        <ResourceBlame history={history} />
      </Panel>
    </Container>
  );
}
