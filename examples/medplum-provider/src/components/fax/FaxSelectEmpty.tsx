// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ListEmptyState } from '@medplum/react';
import { IconMailOpened } from '@tabler/icons-react';
import type { JSX } from 'react';

export function FaxSelectEmpty(): JSX.Element {
  return (
    <ListEmptyState
      icon={<IconMailOpened size={32} />}
      message="No fax selected"
      description="Select a fax from the list to view its contents and details"
    />
  );
}
