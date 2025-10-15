// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { Container } from '../Container/Container';
import type { PanelProps } from '../Panel/Panel';
import { Panel } from '../Panel/Panel';

export function Document(props: PanelProps): JSX.Element {
  const { children, ...others } = props;
  return (
    <Container>
      <Panel {...others}>{children}</Panel>
    </Container>
  );
}
