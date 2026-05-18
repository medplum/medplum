// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Card, Group, Loader, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { Encounter, Parameters, Practitioner, Provenance, Reference, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum, useWhisper } from '@medplum/react';
import { IconMicrophone, IconPlayerStopFilled, IconSparkles } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { ChartNoteStatus } from '../../types/encounter';
import { updateEncounterStatus } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { TaskPanel } from '../tasks/encounter/TaskPanel';
import { BillingTab } from './BillingTab';
import { EncounterHeader } from './EncounterHeader';
import { SignAddendum } from './SignAddendum';

const FHIR_ACT_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActReason';
const FHIR_PROVENANCE_PARTICIPANT_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/provenance-participant-type';
const FHIR_DOCUMENT_COMPLETION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion';

const TASK_COMPLETED_STATUSES = new Set<Task['status']>([
  'completed',
  'cancelled',
  'failed',
  'rejected',
  'entered-in-error',
]);

const SOAP_MODEL = 'gpt-5-mini';

const SOAP_SYSTEM_PROMPT = `You are a clinical documentation assistant. Given a practitioner's freeform notes (which may include raw dictated speech), produce a clean SOAP note with exactly four sections:

**Subjective:** What the patient reports — symptoms, history, concerns in their own words.
**Objective:** Observable findings — vitals, exam findings, measurable data.
**Assessment:** Clinical impression and differential diagnosis.
**Plan:** Treatment plan, medications, follow-up, patient education.

Rules:
- Output only the SOAP note. No preamble, no commentary, no closing remarks.
- Use the bold markdown section headers exactly as shown above.
- If a section has no relevant information in the source, write "(none documented)".
- Preserve clinical specifics from the input verbatim; do not fabricate findings or diagnoses.
- Be concise but complete.`;

export interface EncounterChartProps {
  encounter: WithId<Encounter> | Reference<Encounter>;
}

export const EncounterChart = (props: EncounterChartProps): JSX.Element => {
  const { encounter: encounterProp } = props;
  const medplum = useMedplum();

  const [activeTab, setActiveTab] = useState('notes');
  const {
    encounter,
    patient: patientResource,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    chargeItems,
    appointment,
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setClinicalImpression,
    setChargeItems,
  } = useEncounterChart(encounterProp);

  const [chartNote, setChartNote] = useState(clinicalImpression?.note?.[0]?.text);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum, SAVE_TIMEOUT_MS);
  const [provenances, setProvenances] = useState<Provenance[]>([]);
  const [chartNoteStatus, setChartNoteStatus] = useState(ChartNoteStatus.Unsigned);

  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;

  const chartNoteRef = useRef(chartNote);
  useEffect(() => {
    chartNoteRef.current = chartNote;
  }, [chartNote]);

  useEffect(() => {
    if (!encounter) {
      return;
    }

    const fetchProvenance = async (): Promise<void> => {
      const provenance = await medplum.searchResources('Provenance', `target=${getReferenceString(encounter)}`);
      setProvenances(provenance);
      if (provenance.length > 0 && clinicalImpression?.status === 'completed') {
        setChartNoteStatus(ChartNoteStatus.SignedAndLocked);
      } else if (provenance.length > 0) {
        setChartNoteStatus(ChartNoteStatus.Signed);
      } else {
        setChartNoteStatus(ChartNoteStatus.Unsigned);
      }
    };

    fetchProvenance().catch((err) => showErrorNotification(err));
  }, [clinicalImpression, encounter, medplum]);

  const updateTaskList = useCallback(
    (updatedTask: WithId<Task>): void => {
      setTasks((prevTasks) => prevTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [setTasks]
  );

  const handleEncounterStatusChange = useCallback(
    async (newStatus: Encounter['status']): Promise<void> => {
      if (!encounter) {
        return;
      }

      try {
        const updatedEncounter = await updateEncounterStatus(medplum, encounter, appointment, newStatus);
        setEncounter(updatedEncounter);
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [encounter, medplum, setEncounter, appointment]
  );

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
  };

  const updateChartNote = useCallback(
    async (value: string): Promise<void> => {
      setChartNote(value);
      chartNoteRef.current = value;

      if (!clinicalImpression) {
        return;
      }

      try {
        if (!value) {
          const { note: _note, ...restOfClinicalImpression } = clinicalImpression;
          await debouncedUpdateResource(restOfClinicalImpression);
        } else {
          await debouncedUpdateResource({ ...clinicalImpression, note: [{ text: value }] });
        }
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [clinicalImpression, debouncedUpdateResource]
  );

  const handleChartNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>): Promise<void> => {
    return updateChartNote(e.target.value);
  };

  const { start, stop, status } = useWhisper({
    model: 'gpt-4o-transcribe',
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const previous = (chartNoteRef.current ?? '').trim();
      const next = previous ? `${previous} ${trimmed}` : trimmed;
      updateChartNote(next).catch(showErrorNotification);
    },
  });

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isActive = isConnecting || isRecording;

  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);
  const [soapNote, setSoapNote] = useState<string>('');

  const generateSoapNote = useCallback(async (): Promise<void> => {
    const source = (chartNoteRef.current ?? '').trim();
    if (!source) {
      return;
    }
    setIsGeneratingSoap(true);
    try {
      const messages = [
        { role: 'system', content: SOAP_SYSTEM_PROMPT },
        { role: 'user', content: source },
      ];
      const response: Parameters = await medplum.post(medplum.fhirUrl('$ai'), {
        resourceType: 'Parameters',
        parameter: [
          { name: 'messages', valueString: JSON.stringify(messages) },
          { name: 'model', valueString: SOAP_MODEL },
          { name: 'temperature', valueString: '0.2' },
        ],
      } satisfies Parameters);
      const content = response.parameter?.find((p) => p.name === 'content')?.valueString?.trim();
      if (content) {
        setSoapNote(content);
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setIsGeneratingSoap(false);
    }
  }, [medplum]);

  const handleVoiceToggle = (): void => {
    if (isActive) {
      stop();
      if ((chartNoteRef.current ?? '').trim()) {
        generateSoapNote().catch(showErrorNotification);
      }
    } else {
      start().catch(showErrorNotification);
    }
  };

  let voiceTooltip = 'Start voice input';
  if (!isVoiceEnabled) {
    voiceTooltip = 'Voice input is not enabled in this project. Add the "ai-realtime" feature to enable it.';
  } else if (isActive) {
    voiceTooltip = `Stop voice input and generate SOAP note (${status})`;
  }

  const handleSign = async (practitioner: Reference<Practitioner>, lock: boolean): Promise<void> => {
    if (!encounter) {
      return;
    }

    if (lock) {
      // Complete all incomplete tasks
      const tasksToUpdate = tasks.filter((task) => !TASK_COMPLETED_STATUSES.has(task.status));
      const updatedTasks = await Promise.all(
        tasksToUpdate.map((task) =>
          medplum.updateResource({
            ...task,
            status: 'completed',
          })
        )
      );

      setTasks(
        tasks.map((task) => {
          const updated = updatedTasks.find((t) => t.id === task.id);
          return updated || task;
        })
      );

      // Mark clinical impression as completed
      if (clinicalImpression) {
        const updatedImpression = await medplum.updateResource({ ...clinicalImpression, status: 'completed' });
        setClinicalImpression(updatedImpression);
      }
    }

    // Create provenance record with signature
    const newProvenance = await medplum.createResource<Provenance>({
      resourceType: 'Provenance',
      target: [createReference(encounter)],
      recorded: new Date().toISOString(),
      reason: [
        {
          coding: [
            {
              system: FHIR_ACT_REASON_SYSTEM,
              code: 'SIGN',
              display: 'Signed',
            },
          ],
        },
      ],
      agent: [
        {
          type: {
            coding: [
              {
                system: FHIR_PROVENANCE_PARTICIPANT_TYPE_SYSTEM,
                code: 'author',
              },
            ],
          },
          who: practitioner,
        },
      ],
      signature: [
        {
          type: [
            {
              system: FHIR_DOCUMENT_COMPLETION_SYSTEM,
              code: 'LA',
              display: 'legally authenticated',
            },
          ],
          when: new Date().toISOString(),
          who: practitioner,
        },
      ],
    });

    setProvenances([...provenances, newProvenance]);

    if (lock) {
      setChartNoteStatus(ChartNoteStatus.SignedAndLocked);
    } else {
      setChartNoteStatus(ChartNoteStatus.Signed);
    }
  };

  if (!patientResource || !encounter) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader
          encounter={encounter}
          chartNoteStatus={chartNoteStatus}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
          onTabChange={handleTabChange}
          onSign={handleSign}
        />
        <Box p="md">
          {activeTab === 'notes' && (
            <Stack gap="md">
              <SignAddendum encounter={encounter} provenances={provenances} chartNoteStatus={chartNoteStatus} />

              {clinicalImpression && (
                <Card withBorder shadow="sm" mt="md">
                  <Group justify="space-between" align="center" mb="xs">
                    <Title>Fill chart note</Title>
                    <Tooltip label={voiceTooltip}>
                      <ActionIcon
                        aria-label={isActive ? 'Stop voice input' : 'Start voice input'}
                        radius="xl"
                        size="lg"
                        variant="filled"
                        color={isRecording ? 'red' : undefined}
                        onClick={handleVoiceToggle}
                        disabled={
                          chartNoteStatus === ChartNoteStatus.SignedAndLocked ||
                          isConnecting ||
                          !isVoiceEnabled ||
                          isGeneratingSoap
                        }
                        loading={isConnecting}
                        data-disabled={!isVoiceEnabled || undefined}
                        bg="#7c3aed"
                        style={!isVoiceEnabled ? { pointerEvents: 'auto' } : undefined}
                      >
                        {isRecording ? <IconPlayerStopFilled size={18} /> : <IconMicrophone size={18} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Textarea
                    defaultValue={clinicalImpression.note?.[0]?.text}
                    value={chartNote}
                    onChange={handleChartNoteChange}
                    autosize
                    minRows={4}
                    maxRows={8}
                    disabled={chartNoteStatus === ChartNoteStatus.SignedAndLocked}
                  />
                </Card>
              )}
              {(isGeneratingSoap || soapNote) && (
                <Card withBorder shadow="sm">
                  <Group gap="xs" mb="xs" align="center">
                    <IconSparkles size={20} color="#7c3aed" />
                    <Title>SOAP note</Title>
                  </Group>
                  {isGeneratingSoap ? (
                    <Group gap="sm" py="md">
                      <Loader size="sm" />
                      <Text c="dimmed">Generating SOAP note…</Text>
                    </Group>
                  ) : (
                    <Textarea
                      value={soapNote}
                      onChange={(e) => setSoapNote(e.currentTarget.value)}
                      autosize
                      minRows={6}
                      maxRows={20}
                    />
                  )}
                </Card>
              )}
              {tasks.map((task) => (
                <TaskPanel
                  key={task.id}
                  task={task}
                  onUpdateTask={updateTaskList}
                  enabled={chartNoteStatus !== ChartNoteStatus.SignedAndLocked}
                />
              ))}
            </Stack>
          )}
          {activeTab === 'details' && (
            <BillingTab
              encounter={encounter}
              setEncounter={setEncounter}
              claim={claim}
              patient={patientResource}
              practitioner={practitioner}
              setPractitioner={setPractitioner}
              chargeItems={chargeItems}
              setChargeItems={setChargeItems}
              setClaim={setClaim}
              chartNoteStatus={chartNoteStatus}
            />
          )}
        </Box>
      </Stack>
    </>
  );
};
