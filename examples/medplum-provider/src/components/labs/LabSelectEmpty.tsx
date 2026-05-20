// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ListEmptyState } from '@medplum/react';
import type { JSX } from 'react';

type LabTab = 'open' | 'completed';

interface LabSelectEmptyProps {
  activeTab: LabTab;
}

export function LabSelectEmpty({ activeTab: _activeTab }: LabSelectEmptyProps): JSX.Element {
  return <ListEmptyState message="Lab details will appear here when selected." />;
}
