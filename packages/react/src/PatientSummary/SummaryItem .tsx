import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { JSX } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './PatientSummary.module.css';

interface SummaryItemProps {
  title: string;
  subtitle?: string;
  status?: string;
  color?: string;
  onClick: () => void;
}

export const SummaryItem = ({ title, subtitle, status = 'unknown', color, onClick }: SummaryItemProps): JSX.Element => {
  return (
    <Box className={styles.patientSummaryListItem} onClick={onClick}>
      <Tooltip label={title} position="top-start" openDelay={650}>
        <Box style={{ position: 'relative' }}>
          <Text size="sm" className={styles.patientSummaryListItemText}>
            {title}
          </Text>
          <Group mt={2} gap={4}>
            {status && <StatusBadge color={color} variant="light" status={status} />}
            {subtitle && (
              <Text size="xs" fw={500} color="gray.6">
                {subtitle}
              </Text>
            )}
          </Group>
          <div className={styles.patientSummaryGradient} />
          <div className={styles.patientSummaryChevronContainer}>
            <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
              <IconChevronRight size={16} stroke={2.5} />
            </ActionIcon>
          </div>
        </Box>
      </Tooltip>
    </Box>
  );
};
