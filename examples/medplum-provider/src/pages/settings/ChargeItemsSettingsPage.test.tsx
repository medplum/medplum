// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChargeItemDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { screen } from '../../test-utils/render';
import { ChargeItemsSettingsPage } from './ChargeItemsSettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

describe('ChargeItemsSettingsPage', () => {
  test('shows an empty state', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    await renderSettingsPage(medplum, <ChargeItemsSettingsPage />);
    expect(await screen.findByText('No charge item definitions yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New definition' })).toHaveAttribute('href', '/ChargeItemDefinition/new');
  });

  test('lists charge item definitions', async () => {
    const medplum = new MockClient();
    const definition: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      id: 'cid-1',
      url: 'https://example.com/fee-schedule',
      title: 'Office visit fee schedule',
      status: 'active',
      propertyGroup: [{}, {}],
    };
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([definition] as any);
    await renderSettingsPage(medplum, <ChargeItemsSettingsPage />);

    expect(await screen.findByRole('link', { name: 'Office visit fee schedule' })).toHaveAttribute(
      'href',
      '/ChargeItemDefinition/cid-1'
    );
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
