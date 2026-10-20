// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Text, TextInput } from '@mantine/core';
import { formatHumanName, getReferenceString } from '@medplum/core';
import type { ContactPoint, HumanName } from '@medplum/fhirtypes';
import { MedplumLink, ResourceAvatar, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCode, IconUserCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { SettingsPage, SettingsRow, SettingsSection } from '../../components/settings/SettingsLayout';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

export function AccountSettingsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const name = profile?.name?.[0];
  const [given, setGiven] = useState(name?.given?.join(' ') ?? '');
  const [family, setFamily] = useState(name?.family ?? '');
  const [saving, setSaving] = useState(false);

  if (!profile) {
    return null;
  }

  const email = profile.telecom?.find((t: ContactPoint) => t.system === 'email')?.value;
  const dirty = given !== (name?.given?.join(' ') ?? '') || family !== (name?.family ?? '');

  async function save(): Promise<void> {
    if (!profile) {
      return;
    }
    setSaving(true);
    try {
      const updatedName: HumanName = { ...name, given: given.split(' ').filter(Boolean), family };
      await medplum.updateResource({ ...profile, name: [updatedName, ...(profile.name?.slice(1) ?? [])] });
      // Re-activating the current login reloads the cached profile, so the navbar picks up the new name.
      const activeLogin = medplum.getActiveLogin();
      if (activeLogin) {
        await medplum.setActiveLogin(activeLogin);
      }
      showSuccessNotification({ message: 'Account updated' });
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPage title="Account" description="Your personal profile in this project.">
      <SettingsSection
        title="Profile"
        description="How you appear to others in this project."
        icon={<IconUserCircle size={22} />}
      >
        <SettingsRow label="Profile picture" description="Shown next to your name across the app.">
          <ResourceAvatar value={profile} size={48} radius="xl" />
        </SettingsRow>
        <SettingsRow label="First name">
          <TextInput aria-label="First name" value={given} onChange={(e) => setGiven(e.currentTarget.value)} w={260} />
        </SettingsRow>
        <SettingsRow label="Last name">
          <TextInput aria-label="Last name" value={family} onChange={(e) => setFamily(e.currentTarget.value)} w={260} />
        </SettingsRow>
        <SettingsRow label="Email" description="The address you sign in with.">
          <Text size="sm">{email ?? '—'}</Text>
        </SettingsRow>
      </SettingsSection>
      <Group justify="flex-end">
        <Button disabled={!dirty} loading={saving} onClick={save}>
          Save changes
        </Button>
      </Group>
      <SettingsSection
        title="Advanced"
        description="The FHIR resource behind your profile."
        icon={<IconCode size={22} />}
      >
        <SettingsRow
          label="Profile resource"
          description={`${profile.resourceType} for ${formatHumanName(name) || 'this user'}`}
        >
          <MedplumLink to={`/${getReferenceString(profile)}`}>View resource</MedplumLink>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
