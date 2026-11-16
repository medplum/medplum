// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, Text, Tooltip } from '@mantine/core';
import type { JSX } from 'react';
import styles from './PatientSummary.module.css';
import SummaryItem from './SummaryItem';

export interface PatientInfoItemProps {
  value: string | undefined;
  icon: React.ReactNode;
  placeholder: string;
  label: string;
  onClick?: () => void;
}

export const PatientInfoItem = (props: PatientInfoItemProps): JSX.Element => {
  const { value, icon, placeholder, label, onClick } = props;
  const displayText = value || placeholder;

  return (
    <SummaryItem onClick={onClick}>
      <Box className={styles.patientSummaryListItem}>
        <Tooltip label={label} position="top-start" openDelay={650}>
          <Group gap="sm" align="center" ml={6} mr={2} style={{ flexWrap: 'nowrap', minWidth: 0 }}>
            {icon}
            <Text fz="sm" fw={400} truncate c={value ? 'inherit' : 'var(--mantine-color-gray-6)'}>
              {displayText}
            </Text>
          </Group>
        </Tooltip>
      </Box>
    </SummaryItem>
  );
};
