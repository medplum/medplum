// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { screen, userEvent } from '../../test-utils/render';
import { PreferencesSettingsPage } from './PreferencesSettingsPage';
import { renderSettingsPage } from './settingsTestUtils';

describe('PreferencesSettingsPage', () => {
  test('switches the theme', async () => {
    const user = userEvent.setup();
    await renderSettingsPage(new MockClient(), <PreferencesSettingsPage />);

    const dark = screen.getByRole('radio', { name: 'Dark' });
    expect(dark).not.toBeChecked();
    await user.click(screen.getByText('Dark'));
    expect(dark).toBeChecked();
    expect(screen.getByText(Intl.DateTimeFormat().resolvedOptions().timeZone)).toBeInTheDocument();
  });
});
