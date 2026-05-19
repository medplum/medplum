// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Button, CopyButton, Group, Stack, Stepper, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import type { Patient, Questionnaire } from '@medplum/fhirtypes';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { getConfig } from '../config';
import { PHQA } from '../data/phqa';

interface MagicLinkResult {
  url: string;
  expiresAt: string;
}

export function AdminPage(): JSX.Element {
  const medplum = useMedplum();
  const [active, setActive] = useState(0);
  const [populating, setPopulating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [patient, setPatient] = useState<Patient>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [magicLink, setMagicLink] = useState<MagicLinkResult>();

  async function handlePopulate(): Promise<void> {
    setPopulating(true);
    try {
      // Reuse existing demo patient and questionnaire if already created
      const [existingPatient, existingQuestionnaire] = await Promise.all([
        medplum.searchOne('Patient', {
          family: 'Smith',
          given: 'Jane',
          birthdate: '2008-03-15',
          _tag: 'https://medplum.com/tags|preauth-demo',
        }),
        medplum.searchOne('Questionnaire', { name: PHQA.name, _tag: 'https://medplum.com/tags|preauth-demo' }),
      ]);

      const [resolvedPatient, resolvedQuestionnaire] = await Promise.all([
        existingPatient ??
          medplum.createResource<Patient>({
            resourceType: 'Patient',
            meta: { tag: [{ system: 'https://medplum.com/tags', code: 'preauth-demo', display: 'Pre-Authorized Code Demo' }] },
            name: [{ given: ['Jane'], family: 'Smith' }],
            birthDate: '2008-03-15',
            gender: 'female',
          }),
        existingQuestionnaire ??
          medplum.createResource<Questionnaire>({
            ...PHQA,
            id: undefined,
            meta: { tag: [{ system: 'https://medplum.com/tags', code: 'preauth-demo', display: 'Pre-Authorized Code Demo' }] },
          }),
      ]);

      setPatient(resolvedPatient);
      setQuestionnaire(resolvedQuestionnaire);
      setActive(1);
      showNotification({ color: 'green', message: 'Resources ready' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setPopulating(false);
    }
  }

  async function handleGenerateLink(): Promise<void> {
    if (!patient?.id || !questionnaire?.id) {
      return;
    }
    setGenerating(true);
    setMagicLink(undefined);
    try {
      const botId = getConfig().botId;
      if (!botId) {
        throw new Error('MEDPLUM_BOT_ID is not configured. Run npm run build:bots and update your .env file.');
      }
      const result = await medplum.executeBot(botId, {
        patientId: patient.id,
        questionnaireId: questionnaire.id,
      });
      const { preAuthorizedCode, expiresAt, clientId } = result as {
        preAuthorizedCode: string;
        expiresAt: string;
        clientId: string;
      };
      const params = new URLSearchParams({
        code: preAuthorizedCode,
        clientId,
        questionnaireId: questionnaire.id,
        patientId: patient.id,
      });
      setMagicLink({
        url: `${window.location.origin}/fill?${params.toString()}`,
        expiresAt,
      });
      setActive(2);
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Document width={700}>
      <Stack gap="xl">
        <div>
          <Title order={2}>Pre-Authorized Code Demo</Title>
          <Text c="dimmed" mt={4}>
            Follow the steps below to generate a magic link that lets a patient fill out a PHQ-A questionnaire without
            logging in. This demo implements the{' '}
            <Anchor href="https://www.medplum.com/docs/auth/pre-authorized-code" target="_blank">
              OID4VCI pre-authorized code flow.
            </Anchor>
            <br />
            A Medplum Bot calls <code>/auth/preauthorize</code> to generate a one-time code and packages it
            into a magic link.
          </Text>
        </div>

        <Stepper active={active} orientation="vertical">
          <Stepper.Step
            label="Populate project resources"
            description="Create a demo patient and PHQ-A questionnaire"
          >
            <Stack mt="sm" gap="sm">
              <Text size="sm">
                This will create a demo <strong>Patient</strong> (Jane Smith) and the <strong>PHQ-A</strong>{' '}
                questionnaire in your project.
              </Text>
              <div>
                <Button onClick={() => handlePopulate().catch(console.error)} loading={populating}>
                  Populate Project Resources
                </Button>
              </div>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Generate magic link" description="Create a one-time pre-authorized code">
            <Stack mt="sm" gap="sm">
              {patient && questionnaire && (
                <Stack gap={4}>
                  <Text size="sm">
                    Patient: <strong>{patient.name?.[0]?.given?.[0]} {patient.name?.[0]?.family}</strong> ({patient.id})
                  </Text>
                  <Text size="sm">
                    Questionnaire: <strong>{questionnaire.title}</strong> ({questionnaire.id})
                  </Text>
                </Stack>
              )}
              <Text size="sm">
                The magic link encodes a one-time pre-authorized code. When the patient opens it, they are
                automatically authenticated and can fill out the questionnaire.
              </Text>
              <div>
                <Button onClick={() => handleGenerateLink().catch(console.error)} loading={generating}>
                  Generate Magic Link
                </Button>
              </div>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Share link" description="Copy and open the magic link">
            <Stack mt="sm" gap="sm">
              {magicLink && (
                <>
                  <TextInput
                    label="Magic link"
                    value={magicLink.url}
                    readOnly
                    rightSection={
                      <CopyButton value={magicLink.url}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied' : 'Copy'}>
                            <ActionIcon variant="subtle" onClick={copy}>
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    }
                    rightSectionWidth={36}
                  />
                  <Text size="sm" c="dimmed">
                    Expires: {new Date(magicLink.expiresAt).toLocaleString()}. This link is single-use.
                  </Text>
                  <Group>
                    <Button
                      variant="light"
                      leftSection={<IconExternalLink size={16} />}
                      component="a"
                      href={magicLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in new tab
                    </Button>
                    <Button variant="subtle" onClick={() => handleGenerateLink().catch(console.error)} loading={generating}>
                      Generate new link
                    </Button>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Tip: paste the link into an incognito window to experience the patient flow without being logged in.
                  </Text>
                </>
              )}
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Document>
  );
}
