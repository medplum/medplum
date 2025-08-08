// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { JSX, ReactNode } from 'react';
import styles from './SummaryItem.module.css';

interface SummaryItemProps {
  children: ReactNode;
  onClick: () => void;
}

export default function SummaryItem(props: SummaryItemProps): JSX.Element {
  const { children, onClick } = props;
  return (
    <Box className={styles.item} onClick={onClick}>
      {children}
      <div className={styles.gradient} />
      <div className={styles.container}>
        <ActionIcon className={styles.chevron} size="md" variant="transparent" tabIndex={-1}>
          <IconChevronRight size={16} stroke={2.5} />
        </ActionIcon>
      </div>
    </Box>
  );
}
