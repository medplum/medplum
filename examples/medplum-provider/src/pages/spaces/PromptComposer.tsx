// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Menu, Popover, Text, Textarea, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum, useResource, useWhisper } from '@medplum/react';
import { IconArrowRight, IconCheck, IconCircleFilled, IconMicrophone, IconUsers, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import type { SpaceModelOption } from '../../utils/spaceModels';
import { OpenAILogo } from './OpenAILogo';
import { PatientPicker } from './PatientPicker';
import classes from './PromptComposer.module.css';

type InputMode = 'idle' | 'voice';

function PatientPill({
  patient,
  onRemove,
}: {
  patient: Patient | Reference<Patient>;
  onRemove: () => void;
}): JSX.Element {
  const resource = useResource(patient);
  const patientName = resource ? getDisplayString(resource) : '';
  return (
    <div className={classes.chatAttachmentPill}>
      <ResourceAvatar value={patient} size={18} radius="xl" />
      <Text fz="xs" ml={2}>
        {patientName}
      </Text>
      <span
        className={classes.chatAttachmentPillDismiss}
        role="button"
        tabIndex={0}
        onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        onClick={onRemove}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onRemove();
          }
        }}
        aria-label={`Remove ${patientName}`}
      >
        <IconX size={12} />
      </span>
    </div>
  );
}

interface PromptComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (overrideInput?: string) => void;
  loading: boolean;
  models: SpaceModelOption[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  selectedPatients: (Patient | Reference<Patient>)[];
  setSelectedPatients: React.Dispatch<React.SetStateAction<(Patient | Reference<Patient>)[]>>;
}

export function PromptComposer({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  loading,
  models,
  selectedModel,
  onModelChange,
  selectedPatients,
  setSelectedPatients,
}: PromptComposerProps): JSX.Element {
  const medplum = useMedplum();
  const isVoiceEnabled = medplum.getProject()?.features?.includes('ai-realtime') ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelPickerOpen, modelPickerHandlers] = useDisclosure(false);
  const [patientPickerOpen, patientPickerHandlers] = useDisclosure(false);
  const patientPickerDropdownRef = useRef<HTMLDivElement>(null);
  const modelPickerDropdownRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  // Track whether the textarea has grown past its max height and become scrollable
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return undefined;
    }
    const raf = requestAnimationFrame(() => {
      // 4px tolerance: sub-pixel rounding of the autosize height can leave a few stray
      // pixels of scrollHeight; real overflow is at least a full line
      setScrollable(el.scrollHeight > el.clientHeight + 4);
    });
    return () => cancelAnimationFrame(raf);
  }, [input]);

  useEffect(() => {
    if (!patientPickerOpen) {
      return undefined;
    }
    const handler = (e: MouseEvent): void => {
      if (patientPickerDropdownRef.current && !patientPickerDropdownRef.current.contains(e.target as Node)) {
        patientPickerHandlers.close();
      }
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handler);
    };
  }, [patientPickerOpen, patientPickerHandlers]);

  const prevPatientPickerOpen = useRef(false);
  useEffect(() => {
    if (prevPatientPickerOpen.current && !patientPickerOpen) {
      textareaRef.current?.focus();
    }
    prevPatientPickerOpen.current = patientPickerOpen;
  }, [patientPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen) {
      return undefined;
    }
    const handler = (e: MouseEvent): void => {
      if (modelPickerDropdownRef.current && !modelPickerDropdownRef.current.contains(e.target as Node)) {
        modelPickerHandlers.close();
      }
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handler);
    };
  }, [modelPickerOpen, modelPickerHandlers]);

  const prevModelPickerOpen = useRef(false);
  useEffect(() => {
    if (prevModelPickerOpen.current && !modelPickerOpen) {
      textareaRef.current?.focus();
    }
    prevModelPickerOpen.current = modelPickerOpen;
  }, [modelPickerOpen]);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const { start, stop, status } = useWhisper({
    model: 'gpt-4o-transcribe',
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const previous = inputRef.current.trim();
      const next = previous ? `${previous} ${trimmed}` : trimmed;
      inputRef.current = next;
      onInputChange(next);
    },
  });

  const isConnecting = status === 'requesting_microphone' || status === 'connecting' || status === 'connected';
  const isRecording = status === 'listening' || status === 'speech_started' || status === 'speech_stopped';
  const isActive = isConnecting || isRecording;

  const mode: InputMode = isActive ? 'voice' : 'idle';

  // Snapshot of the input taken when voice input starts, so Cancel can restore it.
  const voiceSnapshotRef = useRef('');

  const startVoice = (): void => {
    voiceSnapshotRef.current = inputRef.current;
    start().catch(showErrorNotification);
  };

  // Accept: stop listening and keep the transcribed text in the input to review and send.
  const acceptVoice = (): void => {
    stop();
    textareaRef.current?.focus();
  };

  // Cancel: stop listening and discard everything transcribed during this session.
  const cancelVoice = (): void => {
    stop();
    inputRef.current = voiceSnapshotRef.current;
    onInputChange(voiceSnapshotRef.current);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // Enter while listening accepts the transcript (stops listening) before the parent sends it
    if (mode === 'voice' && e.key === 'Enter' && !e.shiftKey) {
      acceptVoice();
    }
    onKeyDown(e);
  };

  const voiceDisabledTooltip = 'Voice input is not enabled. Add the "ai-realtime" feature to enable it.';
  let listeningState = 'connecting';
  let listeningLabel = 'Connecting…';
  if (isRecording) {
    listeningState = 'recording';
    listeningLabel = 'Listening…';
  }

  const removeSelectedPatient = (patient: Patient | Reference<Patient>): void => {
    const ref = getReferenceString(patient);
    setSelectedPatients((prev) => prev.filter((p) => getReferenceString(p) !== ref));
    textareaRef.current?.focus();
  };

  const selectedModelLabel = models.find((m) => m.value === selectedModel)?.label ?? selectedModel;

  let inputPlaceholder = 'Ask, search, or make anything...';
  if (mode === 'voice') {
    inputPlaceholder = 'Start speaking—your transcribed words will appear here.';
  }

  return (
    <div
      className={classes.chatInputBox}
      data-scrollable={scrollable ? 'true' : undefined}
      data-voice-active={mode === 'voice' ? 'true' : undefined}
      onMouseDown={(e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          !(target instanceof HTMLTextAreaElement) &&
          !(target instanceof HTMLInputElement) &&
          !target.closest('button')
        ) {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }}
    >
      {selectedPatients.length > 0 && (
        <Group gap={6} wrap="wrap" className={classes.chatPillsRow}>
          {selectedPatients.map((patient) => (
            <PatientPill
              key={getReferenceString(patient)}
              patient={patient}
              onRemove={() => removeSelectedPatient(patient)}
            />
          ))}
        </Group>
      )}
      <Textarea
        ref={textareaRef}
        placeholder={inputPlaceholder}
        value={input}
        onChange={(e) => onInputChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        autosize
        minRows={1}
        maxRows={5}
        classNames={{ root: classes.chatTextareaRoot, input: classes.chatTextarea }}
      />
      <div className={classes.chatActionBar}>
        <Group gap={8}>
          {mode === 'voice' ? (
            <div className={classes.listeningStatus} data-state={listeningState}>
              <span className={classes.listeningDotWrapper} aria-hidden>
                <IconCircleFilled size={16} />
              </span>
              <Text fz="xs" fw={400} ml={2} className={classes.listeningLabel} aria-live="polite">
                {listeningLabel}
              </Text>
            </div>
          ) : (
            /* Patient picker */
            <Popover opened={patientPickerOpen} position="top-start" shadow="md" radius="md">
              <Popover.Target>
                <Tooltip label="Patients" position="top" openDelay={100} disabled={patientPickerOpen}>
                  <ActionIcon
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onClick={() => {
                      if (patientPickerOpen) {
                        patientPickerHandlers.close();
                      } else {
                        patientPickerHandlers.open();
                      }
                    }}
                    size={32}
                    radius="xl"
                    color="dark"
                    variant="subtle"
                    className={classes.subtleActionButton}
                    data-selected={patientPickerOpen || undefined}
                    aria-label="Patients"
                    aria-haspopup="menu"
                    aria-expanded={patientPickerOpen}
                  >
                    <IconUsers size={16} stroke={2} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown
                ref={patientPickerDropdownRef}
                p={4}
                miw={240}
                onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
              >
                <Menu>
                  <PatientPicker
                    onSelect={(patient) => {
                      setSelectedPatients((prev) =>
                        prev.some((p) => getReferenceString(p) === getReferenceString(patient))
                          ? prev
                          : [...prev, patient]
                      );
                      patientPickerHandlers.close();
                    }}
                  />
                </Menu>
              </Popover.Dropdown>
            </Popover>
          )}
        </Group>

        <Group gap={8}>
          {mode === 'voice' ? (
            <>
              <Tooltip label="Cancel" position="top" openDelay={100}>
                <ActionIcon
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={cancelVoice}
                  size={32}
                  radius="xl"
                  color="dark"
                  variant="subtle"
                  className={classes.subtleActionButton}
                  aria-label="Cancel voice input"
                >
                  <IconX size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Accept" position="top" openDelay={100}>
                <ActionIcon
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={acceptVoice}
                  size={32}
                  radius="xl"
                  color="blue"
                  variant="filled"
                  aria-label="Accept voice input"
                >
                  <IconCheck size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
            </>
          ) : (
            <>
              {/* Model selector */}
              <Popover opened={modelPickerOpen} position="top-end" shadow="md" radius="md">
                <Popover.Target>
                  <Tooltip label="Model" position="top" openDelay={100} disabled={modelPickerOpen}>
                    <button
                      type="button"
                      className={classes.modelPickerButton}
                      data-open={modelPickerOpen || undefined}
                      aria-haspopup="menu"
                      aria-expanded={modelPickerOpen}
                      onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                      onClick={() => {
                        if (modelPickerOpen) {
                          modelPickerHandlers.close();
                        } else {
                          modelPickerHandlers.open();
                        }
                      }}
                    >
                      <OpenAILogo size={24} />
                      <Text fz="sm" fw={450} lh={1}>
                        {selectedModelLabel}
                      </Text>
                    </button>
                  </Tooltip>
                </Popover.Target>
                <Popover.Dropdown ref={modelPickerDropdownRef} p={4} miw={180}>
                  <Menu>
                    <Menu.Label style={{ padding: 'calc(var(--mantine-spacing-xs) / 2) var(--mantine-spacing-xs)' }}>
                      Model
                    </Menu.Label>
                    {models.map((model) => (
                      <Menu.Item
                        key={model.value}
                        className={classes.modelMenuItem}
                        rightSection={
                          model.value === selectedModel ? (
                            <IconCheck size={16} color="var(--mantine-color-blue-6)" />
                          ) : null
                        }
                        onClick={() => {
                          onModelChange(model.value);
                          modelPickerHandlers.close();
                        }}
                      >
                        <Group gap={4} wrap="nowrap">
                          <OpenAILogo size={24} />
                          <Text size="sm">{model.label}</Text>
                        </Group>
                      </Menu.Item>
                    ))}
                  </Menu>
                </Popover.Dropdown>
              </Popover>

              {/* Send / voice mode slot: voice mode when the input is empty, send once there is text.
                  The send button is disabled while loading, but the textarea stays editable.
                  A selected patient is sendable context on its own, so it also shows Send. */}
              {input.trim() || selectedPatients.length > 0 ? (
                <Tooltip label="Send" position="top" openDelay={100}>
                  <ActionIcon
                    onClick={() => onSend()}
                    size={32}
                    radius="xl"
                    color="blue"
                    variant="filled"
                    className={classes.sendActionButton}
                    aria-label="Send message"
                    disabled={loading}
                  >
                    <IconArrowRight size={16} stroke={2} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label={isVoiceEnabled ? 'Voice Mode' : voiceDisabledTooltip} position="top" openDelay={100}>
                  <ActionIcon
                    onClick={startVoice}
                    size={32}
                    radius="xl"
                    color="dark"
                    variant="subtle"
                    className={classes.subtleActionButton}
                    aria-label="Start voice mode"
                    disabled={loading || !isVoiceEnabled}
                    data-disabled={!isVoiceEnabled || undefined}
                    style={!isVoiceEnabled ? { pointerEvents: 'auto' } : undefined}
                  >
                    <IconMicrophone size={16} stroke={2} />
                  </ActionIcon>
                </Tooltip>
              )}
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
