// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  LoadingOverlay,
  NumberInput,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCheck, IconLanguage, IconNotes, IconUser, IconVirus } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { LanguageSelector } from '../components/LanguageSelector';
import { useLanguage } from '../context/LanguageContext';
import type { SupportedLanguage } from '../context/LanguageContext';
import { getCodingWithTranslation, useDemoData } from '../hooks/useDemoData';

// ---------------------------------------------------------------------------
// Tab: Questionnaire
// ---------------------------------------------------------------------------

interface TabProps {
  patient: ReturnType<typeof useDemoData>['patient'];
  questionnaire: ReturnType<typeof useDemoData>['questionnaire'];
  conditions: ReturnType<typeof useDemoData>['conditions'];
  loading: boolean;
}

function QuestionnaireTab({ patient, questionnaire, loading }: TabProps): JSX.Element {
  const medplum = useMedplum();
  const { t, language } = useLanguage();

  const [answers, setAnswers] = useState<Record<string, string | boolean | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastResponseId, setLastResponseId] = useState<string | undefined>();

  if (loading) {
    return <Text c="dimmed">Loading questionnaire…</Text>;
  }

  if (!questionnaire || !patient) {
    return <Text c="red">Could not load questionnaire. Check your Medplum credentials.</Text>;
  }

  async function handleSubmit(): Promise<void> {
    if (!questionnaire?.id || !patient?.id) {
      return;
    }
    setSubmitting(true);
    try {
      const items: QuestionnaireResponseItem[] = (questionnaire.item ?? []).map((item) => {
        const val = answers[item.linkId];
        let answer: QuestionnaireResponseItem['answer'] = [];

        if (item.type === 'boolean') {
          answer = [{ valueBoolean: Boolean(val) }];
        } else if (item.type === 'integer') {
          answer = [{ valueInteger: Number(val) || 0 }];
        } else if (val !== undefined && val !== '') {
          answer = [{ valueString: String(val) }];
        }

        // Store the text as it was displayed to the user (translated), not the English primary.
        const displayedText = t(item.text, (item as any)._text) ?? item.text;
        return { linkId: item.linkId, text: displayedText, answer };
      });

      const response = await medplum.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        // RFC 5646 / BCP-47 language tag indicating the language the form was filled in.
        language,
        status: 'completed',
        questionnaire: `Questionnaire/${questionnaire.id}`,
        subject: { reference: `Patient/${patient?.id}` },
        authored: new Date().toISOString(),
        item: items,
      });

      setLastResponseId(response.id);
      setAnswers({});
      notifications.show({
        title: 'Response saved',
        message: `QuestionnaireResponse/${response.id}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err) {
      notifications.show({
        title: 'Failed to save response',
        message: String(err),
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t(questionnaire.title, (questionnaire as any)._title)}</Title>
        <Text size="sm" c="dimmed" mt={4}>
          Translations are stored on the <Code>_text</Code> shadow element of each item using the{' '}
          <Code>http://hl7.org/fhir/StructureDefinition/translation</Code> extension. Submitting the form creates a{' '}
          <Code>QuestionnaireResponse</Code> on your Medplum project.
        </Text>
      </div>

      {(questionnaire.item ?? []).map((item) => {
        const label = t(item.text, (item as any)._text) ?? item.text ?? item.linkId;

        let input: JSX.Element;
        if (item.type === 'boolean') {
          input = (
            <Checkbox
              label={label}
              checked={Boolean(answers[item.linkId])}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [item.linkId]: e.target.checked }))}
            />
          );
        } else if (item.type === 'integer') {
          input = (
            <NumberInput
              label={label}
              min={0}
              max={10}
              value={(answers[item.linkId] as number) ?? ''}
              onChange={(val) => setAnswers((prev) => ({ ...prev, [item.linkId]: val }))}
            />
          );
        } else if (item.type === 'text') {
          input = (
            <Textarea
              label={label}
              autosize
              minRows={2}
              value={(answers[item.linkId] as string) ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [item.linkId]: e.target.value }))}
            />
          );
        } else {
          input = (
            <TextInput
              label={label}
              value={(answers[item.linkId] as string) ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [item.linkId]: e.target.value }))}
            />
          );
        }

        return (
          <Card key={item.linkId} withBorder padding="md" radius="md">
            {input}
          </Card>
        );
      })}

      <Button onClick={handleSubmit} loading={submitting} w="fit-content">
        Submit response
      </Button>

      {lastResponseId && (
        <Alert icon={<IconCheck size={16} />} color="green" title="Last submission">
          Saved as{' '}
          <Anchor href={`https://app.medplum.com/QuestionnaireResponse/${lastResponseId}`} target="_blank" size="sm">
            QuestionnaireResponse/{lastResponseId}
          </Anchor>
        </Alert>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Tab: Conditions
// ---------------------------------------------------------------------------

function ConditionsTab({ conditions, patient, loading }: TabProps): JSX.Element {
  const { t } = useLanguage();

  if (loading) {
    return <Text c="dimmed">Loading conditions…</Text>;
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        <Code>Coding.display</Code> carries translations on its <Code>_display</Code> shadow element. Switch languages
        above to see the display string update. These conditions are stored on{' '}
        {patient?.id ? (
          <Anchor href={`https://app.medplum.com/Patient/${patient.id}`} target="_blank" size="sm">
            Patient/{patient.id}
          </Anchor>
        ) : (
          'the demo patient'
        )}{' '}
        in your Medplum project.
      </Text>

      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>SNOMED Code</Table.Th>
            <Table.Th>Display</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {conditions.map((condition) =>
            condition.code?.coding?.map((coding) => {
              const c = getCodingWithTranslation(coding);
              return (
                <Table.Tr key={`${condition.id}-${c.code}`}>
                  <Table.Td>
                    <Code>{c.code}</Code>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500}>{t(c.display, c._display)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="green" variant="light">
                      {condition.clinicalStatus?.coding?.[0]?.display ?? 'Active'}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Tab: Patient Language
// ---------------------------------------------------------------------------

function PatientTab({ patient, loading }: TabProps): JSX.Element {
  const { setLanguage } = useLanguage();

  if (loading) {
    return <Text c="dimmed">Loading patient…</Text>;
  }

  if (!patient) {
    return <Text c="red">Could not load patient.</Text>;
  }

  const preferred = patient.communication?.find((c) => c.preferred);
  const preferredCode = preferred?.language?.coding?.[0]?.code;
  const preferredDisplay = preferred?.language?.coding?.[0]?.display;

  const allLanguages = patient.communication
    ?.map((c) => {
      const lang = c.language?.coding?.[0];
      return `${lang?.display} (${lang?.code})${c.preferred ? ' ✓' : ''}`;
    })
    .join(', ');

  return (
    <Stack gap="md">
      <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Group>
            <Text fw={600} w={160}>
              Name
            </Text>
            <Text>
              {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
            </Text>
          </Group>
          <Group>
            <Text fw={600} w={160}>
              Resource ID
            </Text>
            <Anchor href={`https://app.medplum.com/Patient/${patient.id}`} target="_blank" size="sm">
              Patient/{patient.id}
            </Anchor>
          </Group>
          <Group>
            <Text fw={600} w={160}>
              Preferred Language
            </Text>
            <Badge color="blue" size="md">
              {preferredDisplay} ({preferredCode})
            </Badge>
          </Group>
          <Group align="flex-start">
            <Text fw={600} w={160}>
              All Languages
            </Text>
            <Text size="sm">{allLanguages}</Text>
          </Group>
        </Stack>
      </Card>

      {preferredCode && (
        <Button
          leftSection={<IconLanguage size={16} />}
          onClick={() => setLanguage(preferredCode as SupportedLanguage)}
          variant="light"
          w="fit-content"
        >
          Apply patient's preferred language ({preferredDisplay})
        </Button>
      )}

      <Card withBorder padding="md" radius="md" bg="gray.0">
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            How it works
          </Text>
          <Text size="sm" c="dimmed">
            <Code>Patient.communication</Code> stores known and preferred languages using BCP-47 codes. Your application
            reads the entry where <Code>preferred: true</Code> to automatically select the right translation when
            rendering resources for that patient.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DemoPage(): JSX.Element {
  const { patient, questionnaire, conditions, loading, error } = useDemoData();

  return (
    <Stack gap="lg" p="md" maw={860} mx="auto" pos="relative">
      <LoadingOverlay visible={loading} overlayProps={{ blur: 2 }} loaderProps={{ type: 'dots' }} />

      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Multilingual FHIR Demo</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Demonstrating the <Code>http://hl7.org/fhir/StructureDefinition/translation</Code> extension
          </Text>
        </div>
        <LanguageSelector />
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Could not seed demo data">
          {error.message}
        </Alert>
      )}

      <Tabs defaultValue="questionnaire" variant="outline">
        <Tabs.List>
          <Tabs.Tab value="questionnaire" leftSection={<IconNotes size={15} />}>
            Questionnaire
          </Tabs.Tab>
          <Tabs.Tab value="conditions" leftSection={<IconVirus size={15} />}>
            Conditions
          </Tabs.Tab>
          <Tabs.Tab value="patient" leftSection={<IconUser size={15} />}>
            Patient Language
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="questionnaire" pt="md">
          <QuestionnaireTab patient={patient} questionnaire={questionnaire} conditions={conditions} loading={loading} />
        </Tabs.Panel>
        <Tabs.Panel value="conditions" pt="md">
          <ConditionsTab patient={patient} questionnaire={questionnaire} conditions={conditions} loading={loading} />
        </Tabs.Panel>
        <Tabs.Panel value="patient" pt="md">
          <PatientTab patient={patient} questionnaire={questionnaire} conditions={conditions} loading={loading} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
