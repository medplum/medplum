// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import styles from './Jumbotron.module.css';

export interface JumbotronProps {
  readonly children?: ReactNode;
}

export function Jumbotron(props: JumbotronProps): JSX.Element {
  return <div className={styles.jumbotron}>{props.children}</div>;
}
