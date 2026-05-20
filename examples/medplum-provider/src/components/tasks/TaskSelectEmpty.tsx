// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ListEmptyState } from '@medplum/react';
import { IconClipboardList } from '@tabler/icons-react';
import type { JSX } from 'react';

interface TaskSelectEmptyProps {
  notFound?: boolean;
}

export function TaskSelectEmpty(props: TaskSelectEmptyProps): JSX.Element {
  const { notFound = false } = props;
  return (
    <ListEmptyState
      icon={<IconClipboardList size={32} />}
      message={notFound ? 'Task not found' : 'No task selected'}
      description={notFound ? undefined : 'Select a task from the list to view details, add notes, and manage properties'}
    />
  );
}
