// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import type * as MedplumReact from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SpaceModelOption } from '../../utils/spaceModels';
import { PromptComposer } from './PromptComposer';

// Stand-in for the realtime transcription hook: the tests drive it through `whisper`, which counts
// start/stop calls and can push a transcript the way the websocket would.
const whisper = vi.hoisted(() => ({
  startCount: 0,
  stopCount: 0,
  emitTranscript: undefined as ((text: string) => void) | undefined,
}));

vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MedplumReact>();
  const { useState: useStateInMock } = await import('react');
  return {
    ...actual,
    useWhisper: (options: { onTranscript?: (text: string) => void }) => {
      const [status, setStatus] = useStateInMock('idle');
      whisper.emitTranscript = (text: string) => options.onTranscript?.(text);
      return {
        status,
        error: undefined,
        transcripts: [],
        isListening: status === 'listening',
        muted: false,
        setMuted: vi.fn(),
        start: async (): Promise<void> => {
          whisper.startCount++;
          setStatus('listening');
        },
        stop: (): void => {
          whisper.stopCount++;
          setStatus('idle');
        },
      };
    },
  };
});

const MODELS: SpaceModelOption[] = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
];

interface HarnessProps {
  initialInput?: string;
  initialPatients?: (Patient | Reference<Patient>)[];
  loading?: boolean;
  onSend: (overrideInput?: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onModelChange: (value: string) => void;
}

// The composer is fully controlled, so the tests wrap it in the state its parent would own.
function Harness({
  initialInput,
  initialPatients,
  loading,
  onSend,
  onKeyDown,
  onModelChange,
}: HarnessProps): JSX.Element {
  const [input, setInput] = useState(initialInput ?? '');
  const [selectedPatients, setSelectedPatients] = useState<(Patient | Reference<Patient>)[]>(initialPatients ?? []);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  return (
    <PromptComposer
      input={input}
      onInputChange={setInput}
      onKeyDown={onKeyDown}
      onSend={onSend}
      loading={loading ?? false}
      models={MODELS}
      selectedModel={selectedModel}
      onModelChange={(value) => {
        onModelChange(value);
        setSelectedModel(value);
      }}
      selectedPatients={selectedPatients}
      setSelectedPatients={setSelectedPatients}
    />
  );
}

describe('PromptComposer', () => {
  let medplum: MockClient;
  const onSend = vi.fn();
  const onKeyDown = vi.fn();
  const onModelChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    whisper.startCount = 0;
    whisper.stopCount = 0;
    whisper.emitTranscript = undefined;
    medplum = new MockClient();
    medplum.getProject = vi
      .fn()
      .mockReturnValue({ resourceType: 'Project', id: 'project-123', features: ['ai-realtime'] });
    medplum.searchResources = vi.fn().mockResolvedValue([HomerSimpson]);
  });

  function setup(props: Partial<HarnessProps> = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Harness onSend={onSend} onKeyDown={onKeyDown} onModelChange={onModelChange} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  // The composer owns the only textarea; its placeholder changes with the input mode.
  function textarea(): HTMLTextAreaElement {
    const el = document.querySelector('textarea');
    if (!el) {
      throw new Error('Expected the composer textarea');
    }
    return el;
  }

  async function startListening(): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' }));
    });
  }

  describe('Send', () => {
    test('Swaps the voice action for send once the input has text', () => {
      setup();

      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();

      fireEvent.change(textarea(), { target: { value: 'What is the plan?' } });

      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Start voice mode' })).not.toBeInTheDocument();
    });

    test('Treats whitespace-only input as empty', () => {
      setup({ initialInput: '   ' });

      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
    });

    test('Offers send when only a patient is attached', () => {
      setup({ initialPatients: [HomerSimpson] });

      // An attached patient is sendable context on its own.
      expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
    });

    test('Disables send while a response is loading', () => {
      setup({ initialInput: 'What is the plan?', loading: true });

      expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
      // The textarea stays editable so the next prompt can be drafted.
      expect(textarea()).not.toBeDisabled();
    });

    test('Forwards key presses to the parent', () => {
      setup({ initialInput: 'What is the plan?' });

      fireEvent.keyDown(textarea(), { key: 'Enter' });

      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('Voice input', () => {
    test('Disables voice input when the project lacks the ai-realtime feature', () => {
      medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'project-123', features: [] });
      setup();

      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeDisabled();
    });

    test('Starts listening and swaps the action bar into voice mode', async () => {
      setup();
      await startListening();

      expect(whisper.startCount).toBe(1);
      expect(screen.getByText('Listening…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept voice input' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel voice input' })).toBeInTheDocument();
      // The patient and model pickers give way to the voice controls.
      expect(screen.queryByRole('button', { name: 'Patients' })).not.toBeInTheDocument();
      expect(textarea()).toHaveAttribute('placeholder', 'Start speaking—your transcribed words will appear here.');
    });

    test('Appends each transcript to the input', async () => {
      setup();
      await startListening();

      await act(async () => whisper.emitTranscript?.('Patient reports a headache'));
      expect(textarea()).toHaveValue('Patient reports a headache');

      await act(async () => whisper.emitTranscript?.('  since Tuesday  '));
      expect(textarea()).toHaveValue('Patient reports a headache since Tuesday');
    });

    test('Ignores an empty transcript', async () => {
      setup();
      await startListening();

      await act(async () => whisper.emitTranscript?.('   '));

      expect(textarea()).toHaveValue('');
    });

    test('Accepting keeps the transcript for review', async () => {
      setup();
      await startListening();
      await act(async () => whisper.emitTranscript?.('Patient reports a headache'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Accept voice input' }));
      });

      expect(whisper.stopCount).toBe(1);
      expect(textarea()).toHaveValue('Patient reports a headache');
      expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
    });

    test('Cancelling discards everything transcribed in the session', async () => {
      setup();
      await startListening();
      await act(async () => whisper.emitTranscript?.('Patient reports a headache'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel voice input' }));
      });

      expect(whisper.stopCount).toBe(1);
      expect(textarea()).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
    });

    test('Enter accepts the transcript before the parent sends it', async () => {
      setup();
      await startListening();
      await act(async () => whisper.emitTranscript?.('Patient reports a headache'));

      await act(async () => {
        fireEvent.keyDown(textarea(), { key: 'Enter' });
      });

      // Listening stops first, so the parent sends the finished transcript.
      expect(whisper.stopCount).toBe(1);
      expect(onKeyDown).toHaveBeenCalledTimes(1);
      expect(textarea()).toHaveValue('Patient reports a headache');
    });

    test('Shift+Enter while listening keeps listening', async () => {
      setup();
      await startListening();

      await act(async () => {
        fireEvent.keyDown(textarea(), { key: 'Enter', shiftKey: true });
      });

      expect(whisper.stopCount).toBe(0);
      expect(screen.getByText('Listening…')).toBeInTheDocument();
    });
  });

  describe('Model picker', () => {
    test('Selects a different model', async () => {
      setup();

      fireEvent.click(screen.getByRole('button', { name: /GPT-5.5/ }));

      expect(await screen.findByText('Model')).toBeInTheDocument();
      fireEvent.click(screen.getByText('GPT-5.4'));

      expect(onModelChange).toHaveBeenCalledWith('gpt-5.4');
      expect(screen.getByRole('button', { name: /GPT-5.4/ })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Model')).not.toBeInTheDocument());
    });

    test('Falls back to the raw value for a model missing from the list', () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <PromptComposer
                input=""
                onInputChange={vi.fn()}
                onKeyDown={vi.fn()}
                onSend={vi.fn()}
                loading={false}
                models={MODELS}
                selectedModel="some-custom-model"
                onModelChange={vi.fn()}
                selectedPatients={[]}
                setSelectedPatients={vi.fn()}
              />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /some-custom-model/ })).toBeInTheDocument();
    });
  });

  describe('Patient attachments', () => {
    test('Renders a pill per attached patient and removes it on click', async () => {
      setup({ initialPatients: [HomerSimpson] });

      expect(await screen.findByText('Homer Simpson')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Remove Homer Simpson'));

      await waitFor(() => expect(screen.queryByText('Homer Simpson')).not.toBeInTheDocument());
      // With no text and no patient, the composer returns to offering voice input.
      expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
    });

    // Both the picker result and the resulting pill carry the patient name, so the picker entry is
    // resolved inside the popover dropdown.
    async function pickHomer(): Promise<void> {
      fireEvent.click(screen.getByRole('button', { name: 'Patients' }));
      const dropdown = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('.mantine-Popover-dropdown');
        if (!el) {
          throw new Error('Expected the patient picker dropdown');
        }
        return el;
      });
      fireEvent.click(await within(dropdown).findByText('Homer Simpson'));
    }

    test('Attaches a patient from the picker, at most once', async () => {
      setup();

      await pickHomer();

      expect(await screen.findByLabelText('Remove Homer Simpson')).toBeInTheDocument();

      await pickHomer();

      // Re-selecting the same patient is a no-op rather than a duplicate pill.
      await waitFor(() => expect(screen.getAllByLabelText('Remove Homer Simpson')).toHaveLength(1));
    });
  });
});
