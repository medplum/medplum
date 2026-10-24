// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Group,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Consent, Patient, Questionnaire } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, Panel, StatusBadge, useCachedBinaryUrl, useMedplum } from '@medplum/react';
import { IconCheck, IconCopy, IconExternalLink, IconFileTypePdf } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { getConfig } from '../config';
import { QrCode } from '../components/QrCode';
import { DEMO_TAG } from '../constants';
import { CONSENT_QUESTIONNAIRE } from '../data/consent';

const DEMO_TAG_QUERY = `${DEMO_TAG.system}|${DEMO_TAG.code}`;

// The create-consent bot creates one Consent per group (agreement) in the questionnaire
const CONSENT_COUNT = CONSENT_QUESTIONNAIRE.item?.filter((item) => item.type === 'group').length ?? 0;

interface MagicLinkResult {
  url: string;
  createdAt: string;
  expiresAt: string;
}

function getActiveStep(patient: Patient | undefined, magicLink: MagicLinkResult | undefined, signed: boolean): number {
  if (signed) {
    return 4;
  }
  if (magicLink) {
    return 2;
  }
  return patient ? 1 : 0;
}

function getLinkStatus(signed: boolean, expired: boolean): { label: string; color: string } {
  if (signed) {
    return { label: 'Signed', color: 'green' };
  }
  return expired ? { label: 'Expired', color: 'red' } : { label: 'Sent', color: 'blue' };
}

// Right-hand panel: the Consents created from the signature, and the signed PDF. The preview fills the
// available space, unlike AttachmentDisplay's fixed 400px iframe.
function SignedDocument({ consents }: { consents: Consent[] }): JSX.Element {
  const attachment = consents[0]?.sourceAttachment;
  const url = useCachedBinaryUrl(attachment?.url);
  return (
    <Stack gap="sm">
      <Group justify="space-between" mb="sm">
        <Badge color="green">Signed</Badge>
        <Button
          component="a"
          href={attachment?.url}
          target="_blank"
          rel="noopener noreferrer"
          size="md"
          leftSection={<IconFileTypePdf size={20} />}
        >
          View signed PDF
        </Button>
      </Group>
      <Table verticalSpacing="xs">
        <Table.Tbody>
          {consents.map((consent) => (
            <Table.Tr key={consent.id}>
              <Table.Td>
                <CodeableConceptDisplay value={consent.category[0]} />
              </Table.Td>
              <Table.Td>
                <StatusBadge status={consent.status} />
              </Table.Td>
              <Table.Td ta="right">
                <Anchor href={`https://app.medplum.com/Consent/${consent.id}`} target="_blank" size="sm">
                  View Consent
                </Anchor>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {url && (
        <iframe
          title={attachment?.title}
          src={`${url}#navpanes=0`}
          style={{ width: '100%', height: 'calc(100vh - 420px)', minHeight: 500, border: 0 }}
        />
      )}
    </Stack>
  );
}

export function AdminPage(): JSX.Element {
  const medplum = useMedplum();
  const [populating, setPopulating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [patient, setPatient] = useState<Patient>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [magicLink, setMagicLink] = useState<MagicLinkResult>();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // The bot creates the Consents in parallel, and polling stops once signed, so wait for all of them
  const signed = consents.length >= CONSENT_COUNT;
  const expired = !!magicLink && !signed && now > new Date(magicLink.expiresAt).getTime();
  const linkStatus = getLinkStatus(signed, expired);
  const active = getActiveStep(patient, magicLink, signed);

  // Poll for the Consents created by the create-consent bot once the patient signs
  useEffect(() => {
    if (!patient || !magicLink || signed) {
      return undefined;
    }
    const interval = setInterval(() => {
      setNow(Date.now());
      medplum
        .searchResources(
          'Consent',
          { patient: getReferenceString(patient), _lastUpdated: `ge${magicLink.createdAt}` },
          { cache: 'no-cache' } // the client caches identical GETs for 60s in browsers, which would hide new Consents
        )
        .then(setConsents)
        .catch(console.error);
    }, 3000);
    return () => clearInterval(interval);
  }, [medplum, patient, magicLink, signed]);

  async function handlePopulate(): Promise<void> {
    setPopulating(true);
    try {
      // Reuse the demo patient if it exists, and keep the questionnaire in sync with data/consent.ts
      const existingPatient = await medplum.searchOne('Patient', {
        family: 'Smith',
        given: 'Jane',
        birthdate: '1985-03-15',
        _tag: DEMO_TAG_QUERY,
      });

      const [resolvedPatient, resolvedQuestionnaire] = await Promise.all([
        existingPatient ??
          medplum.createResource<Patient>({
            resourceType: 'Patient',
            meta: { tag: [DEMO_TAG] },
            name: [{ given: ['Jane'], family: 'Smith' }],
            birthDate: '1985-03-15',
            gender: 'female',
          }),
        medplum.upsertResource<Questionnaire>(
          { ...CONSENT_QUESTIONNAIRE, meta: { tag: [DEMO_TAG] } },
          { name: CONSENT_QUESTIONNAIRE.name, _tag: DEMO_TAG_QUERY }
        ),
      ]);

      setPatient(resolvedPatient);
      setQuestionnaire(resolvedQuestionnaire);
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
    setConsents([]);
    try {
      const botId = getConfig().botId;
      if (!botId) {
        throw new Error('MEDPLUM_BOT_ID is not configured. Run npm run build:bots and update your .env file.');
      }
      const result = await medplum.executeBot(botId, { patientId: patient.id });
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
        createdAt: new Date().toISOString(),
        url: `${window.location.origin}/fill?${params.toString()}`,
        expiresAt,
      });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setGenerating(false);
    }
  }

  const header = (
    <div>
      <Title order={2}>Pre-Authorized Code Demo</Title>
      <Text c="dimmed" mt={4}>
        Send a patient a consent document to review and sign from a one-time link, with no login required. A Medplum Bot
        calls <code>/auth/preauthorize</code> to create the one-time code behind the link, using the{' '}
        <Anchor href="https://www.medplum.com/docs/auth/pre-authorized-code" target="_blank">
          OID4VCI pre-authorized code flow
        </Anchor>
        .
      </Text>
    </div>
  );

  const stepper = (
    <Stack gap="md">
      <Stepper active={active} orientation="vertical">
        <Stepper.Step label="Populate project resources" description="Create a demo patient and consent forms">
          <Stack mt="sm" gap="sm">
            <Text size="sm">
              This will create a demo <strong>Patient</strong> (Jane Smith) and the{' '}
              <strong>Patient Consent Forms</strong> questionnaire in your project.
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
                  Patient:{' '}
                  <strong>
                    {patient.name?.[0]?.given?.[0]} {patient.name?.[0]?.family}
                  </strong>{' '}
                  ({patient.id})
                </Text>
                <Text size="sm">
                  Questionnaire: <strong>Patient Consent Forms</strong> ({questionnaire.id})
                </Text>
              </Stack>
            )}
            <Text size="sm">
              The magic link encodes a one-time pre-authorized code. When the patient opens it, they are automatically
              authenticated and can review and sign the consent forms.
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
                <Text size="sm" c="dimmed">
                  In a production use case, send the link via SMS/email to the patient.
                </Text>
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
                <Stack gap={4} align="flex-start">
                  <QrCode value={magicLink.url} />
                  <Text size="xs" c="dimmed">
                    Link can be embedded into a QR code. For testing:
                  </Text>
                  <Text size="xs" c="dimmed">
                    {'On Chrome: Right click on the QR code and select "Search this image with Google Lens".'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {'On Safari: Right click on the QR code and select Open "localhost" in New Tab.'}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Badge color={linkStatus.color}>{linkStatus.label}</Badge>
                  <Text size="sm" c="dimmed">
                    Expires: {new Date(magicLink.expiresAt).toLocaleString()}. This link is single-use.
                  </Text>
                </Group>
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
                  <Button
                    variant="subtle"
                    onClick={() => handleGenerateLink().catch(console.error)}
                    loading={generating}
                  >
                    Generate new link
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Signed document" description="Consents created from the signed form" />
      </Stepper>
      <Text size="sm" c="dimmed">
        Refresh this page to start over
      </Text>
    </Stack>
  );

  // Before signing: a small centered card. After signing: the steps and the signed document side by side.
  if (!signed) {
    return (
      <Document width={700}>
        <Stack gap="xl">
          {header}
          {stepper}
        </Stack>
      </Document>
    );
  }

  return (
    <Group align="stretch" wrap="nowrap" gap="md" p="md">
      <Panel flex="0 0 440px" miw={0}>
        <Stack gap="xl">
          {header}
          {stepper}
        </Stack>
      </Panel>
      <Panel flex={1} miw={0}>
        <SignedDocument consents={consents} />
      </Panel>
    </Group>
  );
}
