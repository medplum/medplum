// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';

export interface ContainerProps {
  readonly children?: ReactNode;
}

export function Container(props: ContainerProps): JSX.Element {
  return <main className="container">{props.children}</main>;
}
