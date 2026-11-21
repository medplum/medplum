// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { SettingsPage } from '../../components/settings/SettingsLayout';
import { IntegrationsPage } from '../integrations/IntegrationsPage';

export function IntegrationsSettingsPage(): JSX.Element {
  return (
    <SettingsPage title="Integrations" description="Connect third-party services to your project.">
      <IntegrationsPage />
    </SettingsPage>
  );
}
