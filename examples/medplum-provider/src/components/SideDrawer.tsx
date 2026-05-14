// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import classes from './SideDrawer.module.css';

type SideDrawerProps = {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly title?: string;
};

// Specialized Drawer component
// - Full page height, right side of viewport
// - The element containing the children fills the available height
//
// Useful if you want to add content to the bottom of the drawer. Example:
//
// <SideDrawer>
//   <Stack justify="space-between" h="100%">
//     <div>
//       Top of drawer content goes here.
//     </div>
//     <div>
//       Bottom of drawer content goes here.
//     </div>
//   </Stack>
// </SideDrawer>
export function SideDrawer(props: SideDrawerProps): JSX.Element {
  const title = props.title ? (
    <Text size="xl" fw={700}>
      {props.title}
    </Text>
  ) : undefined;
  return (
    <Drawer
      opened={props.opened}
      onClose={props.onClose}
      position="right"
      h="100%"
      title={title}
      className={classes.SideDrawer}
    >
      {props.children}
    </Drawer>
  );
}
