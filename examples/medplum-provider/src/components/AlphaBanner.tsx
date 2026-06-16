// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BoxProps } from '@mantine/core';
import { Box, Button, Group, Pill } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './AlphaBanner.module.css';
import { DocsLink } from './DocsLink';

interface AlphaBannerProps extends BoxProps {
  children: React.ReactNode;
}

export function AlphaBanner(props: AlphaBannerProps): JSX.Element {
  const { children, className, ...boxProps } = props;
  return (
    <Box p="sm" {...boxProps} className={cx(classes.alphaBanner, className)}>
      <Group gap="md">
        <Pill className={classes.alphaPill}>Alpha</Pill>
        <span className={classes.content}>{children}</span>
        <Button variant="transparent" component={DocsLink} path="compliance/alpha-beta">
          <IconExternalLink size={20} />
        </Button>
      </Group>
    </Box>
  );
}
