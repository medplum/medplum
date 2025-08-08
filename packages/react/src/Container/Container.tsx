// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContainerProps, Container as MantineContainer } from '@mantine/core';
import { JSX } from 'react';
import classes from './Container.module.css';

export function Container(props: ContainerProps): JSX.Element {
  const { children, ...others } = props;

  return (
    <MantineContainer className={classes.root} {...others}>
      {children}
    </MantineContainer>
  );
}
