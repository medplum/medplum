// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Menu, Popover, Text, Textarea, Tooltip } from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useDictation, useMedplum } from '@medplum/react';
import {
  IconArrowRight,
  IconCheck,
  IconCircleFilled,
  IconMenu4,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStop,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import type { SpaceModelOption } from '../../utils/spaceModels';
import classes from './ChatInput.module.css';
import { PatientPicker } from './PatientPicker';

const SILENCE_AUTO_SEND_MS = 1000;

function OpenAILogo({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 721 721" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M304.246 294.611V249.028C304.246 245.189 305.687 242.309 309.044 240.392L400.692 187.612C413.167 180.415 428.042 177.058 443.394 177.058C500.971 177.058 537.44 221.682 537.44 269.182C537.44 272.54 537.44 276.379 536.959 280.218L441.954 224.558C436.197 221.201 430.437 221.201 424.68 224.558L304.246 294.611ZM518.245 472.145V363.224C518.245 356.505 515.364 351.707 509.608 348.349L389.174 278.296L428.519 255.743C431.877 253.826 434.757 253.826 438.115 255.743L529.762 308.523C556.154 323.879 573.905 356.505 573.905 388.171C573.905 424.636 552.315 458.225 518.245 472.141V472.145ZM275.937 376.182L236.592 353.152C233.235 351.235 231.794 348.354 231.794 344.515V238.956C231.794 187.617 271.139 148.749 324.4 148.749C344.555 148.749 363.264 155.468 379.102 167.463L284.578 222.164C278.822 225.521 275.942 230.319 275.942 237.039V376.186L275.937 376.182ZM360.626 425.122L304.246 393.455V326.283L360.626 294.616L417.002 326.283V393.455L360.626 425.122ZM396.852 570.989C376.698 570.989 357.989 564.27 342.151 552.276L436.674 497.574C442.431 494.217 445.311 489.419 445.311 482.699V343.552L485.138 366.582C488.495 368.499 489.936 371.379 489.936 375.219V480.778C489.936 532.117 450.109 570.985 396.852 570.985V570.989ZM283.134 463.99L191.486 411.211C165.094 395.854 147.343 363.229 147.343 331.562C147.343 294.616 169.415 261.509 203.48 247.593V356.991C203.48 363.71 206.361 368.508 212.117 371.866L332.074 441.437L292.729 463.99C289.372 465.907 286.491 465.907 283.134 463.99ZM277.859 542.68C223.639 542.68 183.813 501.895 183.813 451.514C183.813 447.675 184.294 443.836 184.771 439.997L279.295 494.698C285.051 498.056 290.812 498.056 296.568 494.698L417.002 425.127V470.71C417.002 474.549 415.562 477.429 412.204 479.346L320.557 532.126C308.081 539.323 293.206 542.68 277.854 542.68H277.859ZM396.852 599.776C454.911 599.776 503.37 558.513 514.41 503.812C568.149 489.896 602.696 439.515 602.696 388.176C602.696 354.587 588.303 321.962 562.392 298.45C564.791 288.373 566.231 278.296 566.231 268.224C566.231 199.611 510.571 148.267 446.274 148.267C433.322 148.267 420.846 150.184 408.37 154.505C386.775 133.392 357.026 119.958 324.4 119.958C266.342 119.958 217.883 161.22 206.843 215.921C153.104 229.837 118.557 280.218 118.557 331.557C118.557 365.146 132.95 397.771 158.861 421.283C156.462 431.36 155.022 441.437 155.022 451.51C155.022 520.123 210.682 571.466 274.978 571.466C287.931 571.466 300.407 569.549 312.883 565.228C334.473 586.341 364.222 599.776 396.852 599.776Z"
        fill="currentColor"
      />
    </svg>
  );
}

type InputMode = 'idle' | 'dictation' | 'voice';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (overrideInput?: string) => void;
  loading: boolean;
  models: SpaceModelOption[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  selectedPatients: Patient[];
  onAddPatient: (patient: Patient) => void;
  onRemovePatient: (patientId: string) => void;
}

export function ChatInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  loading,
  models,
  selectedModel,
  onModelChange,
  selectedPatients,
  onAddPatient,
  onRemovePatient,
}: ChatInputProps): JSX.Element {
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

  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  // Hands-free voice mode runs the same capture as dictation but auto-sends on a brief silence
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceActiveRef = useRef(false);
  useEffect(() => {
    voiceActiveRef.current = voiceActive;
  }, [voiceActive]);

  const autoSendRef = useRef<(() => void) | undefined>(undefined);

  const {
    start,
    stop,
    status,
    muted,
    setMuted,
    isRecording,
    interim,
    dictating,
    startDictation,
    cancelDictation,
    acceptDictation,
  } =
    useDictation({
      model: 'gpt-4o-transcribe',
      getValue: () => inputRef.current,
      setValue: (value) => {
        inputRef.current = value;
        onInputChange(value);
      },
      focusInput: () => textareaRef.current?.focus(),
      onError: (err) => showErrorNotification(err),
      onAppend: () => {
        if (voiceActiveRef.current) {
          autoSendRef.current?.();
        }
      },
    });

  let mode: InputMode = 'idle';
  if (voiceActive) {
    mode = 'voice';
  } else if (dictating) {
    mode = 'dictation';
  }

  // Hands-free voice mode: send after a brief silence but keep listening
  const autoSend = useDebouncedCallback(() => {
    const pending = inputRef.current.trim();
    if (pending && voiceActiveRef.current) {
      onSendRef.current(pending);
    }
  }, SILENCE_AUTO_SEND_MS);

  useEffect(() => {
    autoSendRef.current = autoSend;
  }, [autoSend]);

  useEffect(() => {
    if (!voiceActiveRef.current) {
      return;
    }
    if (status === 'speech_stopped') {
      autoSend();
    } else if (status === 'speech_started' || status === 'listening') {
      autoSend.cancel();
    }
  }, [status, autoSend]);

  const startVoiceMode = (): void => {
    setMuted(false);
    setVoiceActive(true);
    start().catch((err) => {
      setVoiceActive(false);
      showErrorNotification(err);
    });
  };

  const stopVoiceMode = (): void => {
    autoSend.cancel();
    stop();
    setVoiceActive(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // Voice mode owns sending via the silence auto-send; ignore Enter to avoid double-sends
    if (voiceActive) {
      e.preventDefault();
      return;
    }
    // Enter during dictation accepts the dictated text before the parent sends it
    if (dictating && e.key === 'Enter' && !e.shiftKey) {
      acceptDictation();
    }
    onKeyDown(e);
  };

  const voiceDisabledTooltip = 'Voice input is not enabled. Add the "ai-realtime" feature to enable it.';
  // In voice mode, a buffered transcript sitting in the input after a pause is about to auto-send.
  // Tying this to the input value means "Sending…" clears the instant the send empties the textarea.
  const sending = mode === 'voice' && status === 'speech_stopped' && input.trim().length > 0;
  // Muting in voice mode pauses listening: show the gray "connecting" dot and a paused label
  const paused = mode === 'voice' && muted;
  let listeningState = 'connecting';
  let listeningLabel = 'Connecting…';
  if (paused) {
    listeningLabel = 'Listening Paused…';
  } else if (sending) {
    listeningState = 'sending';
    listeningLabel = 'Waiting to Send…';
  } else if (isRecording) {
    listeningState = 'recording';
    listeningLabel = 'Listening…';
  }

  const selectedModelLabel = models.find((m) => m.value === selectedModel)?.label ?? selectedModel;

  let inputPlaceholder = 'Ask, search, or make anything...';
  if (mode === 'voice') {
    inputPlaceholder = 'Start speaking—your transcribed words will appear here and then send when you pause.';
  } else if (mode === 'dictation') {
    inputPlaceholder = 'Start speaking—your transcribed words will appear here.';
  }

  // In voice mode, preview the live partial transcript appended after the committed text so the
  // spoken words show up immediately, before the finalized chunk is committed and auto-sent.
  let displayValue = input;
  if (mode === 'voice' && interim) {
    displayValue = input ? `${input} ${interim}` : interim;
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
          {selectedPatients.map((patient) => {
            const patientName = getDisplayString(patient);
            return (
              <div key={patient.id} className={classes.chatAttachmentPill}>
                <ResourceAvatar value={patient} size={18} radius="xl" />
                <Text fz="xs" ml={2}>
                  {patientName}
                </Text>
                <span
                  className={classes.chatAttachmentPillDismiss}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={() => {
                    onRemovePatient(patient.id as string);
                    textareaRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onRemovePatient(patient.id as string);
                      textareaRef.current?.focus();
                    }
                  }}
                  aria-label={`Remove ${patientName}`}
                >
                  <IconX size={12} />
                </span>
              </div>
            );
          })}
        </Group>
      )}
      <Textarea
        ref={textareaRef}
        placeholder={inputPlaceholder}
        value={displayValue}
        onChange={(e) => onInputChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        readOnly={mode === 'voice'}
        autoFocus
        autosize
        minRows={1}
        maxRows={5}
        classNames={{ root: classes.chatTextareaRoot, input: classes.chatTextarea }}
      />
      <div className={classes.chatActionBar}>
        <Group gap={8}>
          {mode !== 'idle' ? (
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
                    excludeIds={selectedPatients.map((p) => p.id as string)}
                    onSelect={(patient) => {
                      onAddPatient(patient);
                      patientPickerHandlers.close();
                    }}
                  />
                </Menu>
              </Popover.Dropdown>
            </Popover>
          )}
        </Group>

        <Group gap={8}>
          {mode === 'voice' && (
            <>
              <Tooltip label={muted ? 'Unmute' : 'Mute'} position="top" openDelay={100}>
                <ActionIcon
                  onClick={() => setMuted(!muted)}
                  size={32}
                  radius="xl"
                  color="dark"
                  variant="subtle"
                  className={classes.subtleActionButton}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? (
                    <IconMicrophoneOff size={16} stroke={2} color="var(--mantine-color-red-6)" />
                  ) : (
                    <IconMicrophone size={16} stroke={2} />
                  )}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Stop" position="top" openDelay={100}>
                <ActionIcon
                  onClick={stopVoiceMode}
                  size={32}
                  radius="xl"
                  color="blue"
                  variant="filled"
                  aria-label="Stop voice mode"
                >
                  <IconPlayerStop size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          {mode === 'dictation' && (
            <>
              <Tooltip label="Cancel" position="top" openDelay={100}>
                <ActionIcon
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={cancelDictation}
                  size={32}
                  radius="xl"
                  color="dark"
                  variant="subtle"
                  className={classes.subtleActionButton}
                  aria-label="Cancel dictation"
                >
                  <IconX size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Accept" position="top" openDelay={100}>
                <ActionIcon
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={acceptDictation}
                  size={32}
                  radius="xl"
                  color="blue"
                  variant="filled"
                  aria-label="Accept dictated text"
                >
                  <IconCheck size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          {mode === 'idle' && (
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

              {/* Dictation */}
              <Tooltip label={isVoiceEnabled ? 'Dictate' : voiceDisabledTooltip} position="top" openDelay={100}>
                <ActionIcon
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={startDictation}
                  size={32}
                  radius="xl"
                  color="dark"
                  variant="subtle"
                  className={classes.subtleActionButton}
                  aria-label="Dictate"
                  disabled={loading || !isVoiceEnabled}
                  data-disabled={!isVoiceEnabled || undefined}
                  style={!isVoiceEnabled ? { pointerEvents: 'auto' } : undefined}
                >
                  <IconMicrophone size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>

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
                <Tooltip
                  label={isVoiceEnabled ? 'Voice Mode' : voiceDisabledTooltip}
                  position="top"
                  openDelay={100}
                >
                  <ActionIcon
                    onClick={startVoiceMode}
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
                    <IconMenu4 size={16} stroke={2} style={{ transform: 'rotate(90deg)' }} />
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
