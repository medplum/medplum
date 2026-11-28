// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Code, CopyButton, Group, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { ProjectSetting } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconBriefcase, IconRocket } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { SettingsPage, SettingsRow, SettingsSection } from '../../components/settings/SettingsLayout';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { HIDE_GET_STARTED_SETTING } from '../../utils/projectSettings';

export function ProjectSettingsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const isAdmin = medplum.isProjectAdmin();
  const [saving, setSaving] = useState(false);

  if (!project) {
    return null;
  }

  const hideGetStarted = project.setting?.find((s) => s.name === HIDE_GET_STARTED_SETTING)?.valueBoolean === true;

  async function setHideGetStarted(hide: boolean): Promise<void> {
    if (!project) {
      return;
    }
    setSaving(true);
    try {
      const settings: ProjectSetting[] = [
        ...(project.setting?.filter((s) => s.name !== HIDE_GET_STARTED_SETTING) ?? []),
        { name: HIDE_GET_STARTED_SETTING, valueBoolean: hide },
      ];
      await medplum.post(`admin/projects/${project.id}/settings`, settings);
      const activeLogin = medplum.getActiveLogin();
      if (activeLogin) {
        await medplum.setActiveLogin(activeLogin);
      }
      showSuccessNotification({ message: 'Project updated' });
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPage title="Project" description="Settings that apply to everyone in this project.">
      <SettingsSection title="General" icon={<IconBriefcase size={22} />}>
        <SettingsRow label="Project name">
          <Text>{project.name}</Text>
        </SettingsRow>
        <SettingsRow label="Project ID" description="Used when configuring integrations and API clients.">
          <CopyButton value={project.id ?? ''}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                <UnstyledButton onClick={copy}>
                  <Code>{project.id}</Code>
                </UnstyledButton>
              </Tooltip>
            )}
          </CopyButton>
        </SettingsRow>
        <SettingsRow label="Features" description="Enabled by Medplum for this project.">
          <Group gap={6}>
            {project.features?.length ? (
              project.features.map((feature) => (
                <Badge key={feature} variant="light" color="gray">
                  {feature}
                </Badge>
              ))
            ) : (
              <Text size="sm">None</Text>
            )}
          </Group>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        title="Onboarding"
        description="Help new members find their way around."
        icon={<IconRocket size={22} />}
      >
        <SettingsRow
          label="Show Get Started guide"
          description={
            isAdmin
              ? 'Show the Get Started link in the sidebar for all members.'
              : 'Only project admins can change this setting.'
          }
        >
          <Switch
            aria-label="Show Get Started guide"
            checked={!hideGetStarted}
            disabled={!isAdmin || saving}
            onChange={(e) => setHideGetStarted(!e.currentTarget.checked)}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
