// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColorScheme } from '@mantine/core';
import { SegmentedControl, Text, useMantineColorScheme } from '@mantine/core';
import { IconClock, IconPalette } from '@tabler/icons-react';
import type { JSX } from 'react';
import { SettingsPage, SettingsRow, SettingsSection } from '../../components/settings/SettingsLayout';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'System' },
  { value: 'dark', label: 'Dark' },
];

export function PreferencesSettingsPage(): JSX.Element {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <SettingsPage title="Preferences" description="How the app looks and behaves for you on this device.">
      <SettingsSection
        title="Interface and theme"
        description="Saved in this browser."
        icon={<IconPalette size={22} />}
      >
        <SettingsRow label="Theme" description="Use light or dark mode, or match your system setting.">
          <SegmentedControl
            aria-label="Theme"
            value={colorScheme}
            onChange={(value) => setColorScheme(value as MantineColorScheme)}
            data={THEME_OPTIONS}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Date and time" icon={<IconClock size={22} />}>
        <SettingsRow label="Time zone" description="Dates and times are shown in your browser's time zone.">
          <Text size="sm">{timeZone}</Text>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
