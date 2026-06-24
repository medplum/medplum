// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import styles from './CardContainer.module.css';

export interface CardContainerProps {
  readonly children?: ReactNode;
}

export function CardContainer(props: CardContainerProps): JSX.Element {
  return <div className={styles.cardContainer}>{props.children}</div>;
}
