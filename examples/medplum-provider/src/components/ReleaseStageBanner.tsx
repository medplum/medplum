// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BoxProps } from '@mantine/core';
import { Box, Button, Group, Pill } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX } from 'react';
import { DocsLink } from './DocsLink';
import classes from './ReleaseStageBanner.module.css';

const STAGE_LABELS = {
  alpha: 'Alpha',
  beta: 'Beta',
} as const;

interface ReleaseStageBannerProps extends BoxProps {
  stage: keyof typeof STAGE_LABELS;
  children: React.ReactNode;
}

export function ReleaseStageBanner(props: ReleaseStageBannerProps): JSX.Element {
  const { stage, children, className, ...boxProps } = props;
  return (
    <Box p="sm" {...boxProps} className={cx(classes.banner, classes[stage], className)}>
      <Group gap="md">
        <Pill className={cx(classes.pill, classes[stage])}>{STAGE_LABELS[stage]}</Pill>
        <span className={classes.content}>{children}</span>
        <Button variant="transparent" component={DocsLink} path="compliance/alpha-beta">
          <IconExternalLink size={20} />
        </Button>
      </Group>
    </Box>
  );
}
