// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Box, Button, Divider, Group, List, Modal, Paper, Stack, Stepper, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCheck, IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useAppsPanel } from '../components/AppsPanel';

interface InstallModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly listingId: string;
  readonly listingName: string;
}

export function InstallModal({ opened, onClose, listingId, listingName }: InstallModalProps): JSX.Element {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { openApp } = useAppsPanel();

  const handleClose = useCallback((): void => {
    setStep(0);
    setCompleted(false);
    onClose();
  }, [onClose]);

  const handleNext = useCallback((): void => {
    setStep((s) => s + 1);
  }, []);

  const handleBack = useCallback((): void => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleComplete = useCallback((): void => {
    install(listingId);
    setCompleted(true);
  }, [install, listingId]);

  const handleOpenApp = useCallback((): void => {
    handleClose();
    if (flow) {
      openApp(flow.appPanelId);
    }
  }, [handleClose, openApp, flow]);

  const totalSteps = flow?.steps.length ?? 2;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={900}
      title={
        <Text fw={600} size="lg">
          Set up {listingName}
        </Text>
      }
      centered
      padding={0}
      styles={{
        header: { padding: 'var(--mantine-spacing-lg)' },
        body: { height: 700, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
      }}
    >
      <Divider />
      <Group gap={0} align="flex-start" wrap="nowrap" style={{ flex: 1, minHeight: 0 }}>
        <Box p="lg" style={{ flexShrink: 0, width: '33%' }}>
          <Stepper
            active={completed ? totalSteps : step}
            orientation="vertical"
            size="sm"
            completedIcon={<IconCheck size={20} />}
          >
            {flow?.steps.map((s, i) => (
              <Stepper.Step key={i} label={s.label} description={s.description} />
            ))}
          </Stepper>
        </Box>
        <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto', height: '100%' }} p="lg">
          {completed ? (
            <SuccessContent
              listingName={listingName}
              checklist={flow?.successChecklist ?? []}
              onOpenApp={handleOpenApp}
              onBack={handleClose}
            />
          ) : (
            <StepContent
              listingId={listingId}
              listingName={listingName}
              stepIndex={step}
              onNext={step < totalSteps - 1 ? handleNext : handleComplete}
              onBack={step > 0 ? handleBack : undefined}
            />
          )}
        </Box>
      </Group>
    </Modal>
  );
}

function SuccessContent({
  listingName,
  checklist,
  onOpenApp,
  onBack,
}: {
  readonly listingName: string;
  readonly checklist: string[];
  readonly onOpenApp: () => void;
  readonly onBack: () => void;
}): JSX.Element {
  return (
    <Stack gap="lg">
      <Box>
        <IconCircleCheck size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
        <Title order={4}>Successfully Installed</Title>
        <Text size="sm" c="dimmed">
          {listingName} has been connected and is ready to use.
        </Text>
      </Box>

      <Paper withBorder p="md" radius="md">
        <List
          size="sm"
          spacing="xs"
          icon={
            <ThemeIcon size={18} radius="xl" color="green" variant="light">
              <IconCheck size={11} />
            </ThemeIcon>
          }
        >
          {checklist.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      </Paper>

      <Stack gap="sm">
        <Button fullWidth size="md" onClick={onOpenApp}>
          Open App
        </Button>
        <Button fullWidth size="md" variant="light" onClick={onBack}>
          Back to Marketplace
        </Button>
      </Stack>
    </Stack>
  );
}
