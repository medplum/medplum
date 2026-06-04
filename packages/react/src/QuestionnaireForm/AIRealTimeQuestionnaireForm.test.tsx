// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider, useWhisper } from '@medplum/react-hooks';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AIRealTimeQuestionnaireFormProps } from './AIRealTimeQuestionnaireForm';
import { AIRealTimeQuestionnaireForm } from './AIRealTimeQuestionnaireForm';

jest.mock('@mantine/notifications');

// Replace useWhisper with a controllable mock while keeping the rest of
// @medplum/react-hooks (useMedplum, MedplumProvider, ...) real.
jest.mock('@medplum/react-hooks', () => {
  const actual = jest.requireActual('@medplum/react-hooks');
  return {
    ...actual,
    useWhisper: jest.fn(),
  };
});

const SILENCE_DEBOUNCE_MS = 3000;
const BOT_IDENTIFIER_STRING = 'https://www.medplum.com/bots|ai-realtime-questionnaire';

const mockUseWhisper = useWhisper as unknown as jest.Mock;

type WhisperStatus =
  | 'idle'
  | 'requesting_microphone'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speech_started'
  | 'speech_stopped'
  | 'disconnected'
  | 'error';

// Handle the test uses to drive the mocked useWhisper hook.
let whisper: {
  setStatus: (status: WhisperStatus) => void;
  emitTranscript: (text: string) => void;
  start: jest.Mock;
  stop: jest.Mock;
};

let startMock: jest.Mock;
let stopMock: jest.Mock;

const sampleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  item: [{ linkId: 'q1', text: 'Name', type: 'string' }],
};

function buildBotResponse(response: QuestionnaireResponse | string): { resourceType: 'Parameters'; parameter: any[] } {
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'questionnaireResponse',
        valueString: typeof response === 'string' ? response : JSON.stringify(response),
      },
    ],
  };
}

interface SetupResult {
  medplum: MockClient;
  searchOneSpy: jest.SpyInstance;
  executeBotSpy: jest.SpyInstance;
}

async function setup(
  props?: Partial<AIRealTimeQuestionnaireFormProps>,
  options?: {
    botAvailable?: boolean;
    voiceFeatureEnabled?: boolean;
    searchOneImpl?: () => Promise<any>;
  }
): Promise<SetupResult> {
  const medplum = new MockClient();
  const botAvailable = options?.botAvailable ?? true;
  const voiceFeatureEnabled = options?.voiceFeatureEnabled ?? true;

  const searchOneImpl =
    options?.searchOneImpl ?? (async () => (botAvailable ? { resourceType: 'Bot', id: 'bot-1' } : undefined));
  const searchOneSpy = jest.spyOn(medplum, 'searchOne').mockImplementation(() => searchOneImpl() as never);

  const project: Project = voiceFeatureEnabled
    ? { resourceType: 'Project', features: ['ai-realtime'] }
    : { resourceType: 'Project' };
  jest.spyOn(medplum, 'getProject').mockReturnValue(project);

  const executeBotSpy = jest.spyOn(medplum, 'executeBot');

  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <AIRealTimeQuestionnaireForm questionnaire={sampleQuestionnaire} {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });

  return { medplum, searchOneSpy, executeBotSpy };
}

// Drive the mocked useWhisper from `idle` through to a debounced flush.
async function dictate(text: string): Promise<void> {
  await act(async () => {
    whisper.setStatus('speech_started');
  });
  await act(async () => {
    whisper.emitTranscript(text);
  });
  await act(async () => {
    whisper.setStatus('speech_stopped');
  });
  await act(async () => {
    jest.advanceTimersByTime(SILENCE_DEBOUNCE_MS);
  });
  await act(async () => {});
}

describe('AIRealTimeQuestionnaireForm', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      value: jest.fn(),
      writable: true,
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    startMock = jest.fn().mockResolvedValue(undefined);
    stopMock = jest.fn();
    mockUseWhisper.mockImplementation((opts: { onTranscript: (text: string) => void }) => {
      const [status, setStatus] = useState<WhisperStatus>('idle');
      whisper = {
        setStatus,
        emitTranscript: (text: string) => opts.onTranscript(text),
        start: startMock,
        stop: stopMock,
      };
      return { status, start: startMock, stop: stopMock, error: undefined, transcripts: [], isListening: false };
    });
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('Renders the dictation banner with idle label', async () => {
    await setup();
    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    expect(screen.getByText('Start Dictation to complete this form with your voice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Dictation' })).toBeEnabled();
  });

  test('Checks bot availability on mount', async () => {
    const { searchOneSpy } = await setup();
    expect(searchOneSpy).toHaveBeenCalledWith('Bot', { identifier: BOT_IDENTIFIER_STRING });
  });

  test('Shows unavailable message and disables button when bot is not deployed', async () => {
    await setup({}, { botAvailable: false });
    expect(screen.getByText(/Voice dictation unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/is not deployed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Dictation' })).toBeDisabled();
  });

  test('Treats bot availability failure as unavailable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await setup({}, { searchOneImpl: async () => Promise.reject(new Error('network')) });
    expect(screen.getByText(/Voice dictation unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Dictation' })).toBeDisabled();
    consoleError.mockRestore();
  });

  test('Disables button when project voice feature is not enabled', async () => {
    await setup({}, { voiceFeatureEnabled: false });
    expect(screen.getByRole('button', { name: 'Start Dictation' })).toBeDisabled();
  });

  test('Starting dictation calls whisper.start and expands the panel', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Expand transcript' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Dictation' }));
    });
    expect(startMock).toHaveBeenCalledTimes(1);
    // Panel expanded -> toggle now offers to collapse.
    expect(screen.getByRole('button', { name: 'Collapse transcript' })).toBeInTheDocument();
  });

  test('Toggling the chevron expands and collapses the transcript panel', async () => {
    await setup();
    const toggle = screen.getByRole('button', { name: 'Expand transcript' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    const collapse = screen.getByRole('button', { name: 'Collapse transcript' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      fireEvent.click(collapse);
    });
    expect(screen.getByRole('button', { name: 'Expand transcript' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('Shows Listening status and live transcript while recording', async () => {
    const onTranscript = jest.fn();
    await setup({ onTranscript });
    await act(async () => {
      whisper.setStatus('listening');
    });
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    await act(async () => {
      whisper.emitTranscript('hello world');
    });
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(onTranscript).toHaveBeenCalledWith('hello world', 'hello world');
  });

  test('Accumulates multiple transcript chunks before flushing', async () => {
    const onTranscript = jest.fn();
    await setup({ onTranscript });
    await act(async () => {
      whisper.setStatus('listening');
    });
    await act(async () => {
      whisper.emitTranscript('hello');
    });
    await act(async () => {
      whisper.emitTranscript('world');
    });
    expect(onTranscript).toHaveBeenLastCalledWith('hello world', 'world');
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  test('Flushes transcript on silence and executes the bot', async () => {
    const updatedResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: [{ linkId: 'q1', answer: [{ valueString: 'Homer' }] }],
    };
    const { executeBotSpy } = await setup();
    executeBotSpy.mockResolvedValue(buildBotResponse(updatedResponse));

    await dictate('my name is Homer');

    expect(executeBotSpy).toHaveBeenCalledTimes(1);
    const [identifier, body] = executeBotSpy.mock.calls[0];
    expect(identifier).toEqual({ system: 'https://www.medplum.com/bots', value: 'ai-realtime-questionnaire' });
    expect(body.resourceType).toBe('Parameters');
    const params = body.parameter as { name: string; valueString: string }[];
    expect(params.find((p) => p.name === 'transcript')?.valueString).toBe('my name is Homer');
    expect(params.find((p) => p.name === 'questionnaire')?.valueString).toBeDefined();
  });

  test('Includes the AI model parameter when aiModel prop is provided', async () => {
    const { executeBotSpy } = await setup({ aiModel: 'gpt-4o' });
    executeBotSpy.mockResolvedValue(buildBotResponse({ resourceType: 'QuestionnaireResponse', status: 'in-progress' }));

    await dictate('hello');

    const body = executeBotSpy.mock.calls[0][1];
    const params = body.parameter as { name: string; valueString: string }[];
    expect(params.find((p) => p.name === 'model')?.valueString).toBe('gpt-4o');
  });

  test('Feeds the prior response back into a subsequent bot call', async () => {
    const { executeBotSpy } = await setup();
    // The AI response carries items, so the next bot call should echo it back.
    executeBotSpy.mockResolvedValue(
      buildBotResponse({
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [{ linkId: 'q1', answer: [{ valueString: 'Homer' }] }],
      })
    );

    await dictate('patient reports headache');
    await dictate('and nausea');

    expect(executeBotSpy).toHaveBeenCalledTimes(2);
    // The second call echoes the response the AI produced from the first call.
    const secondBody = executeBotSpy.mock.calls[1][1];
    const echoed = secondBody.parameter.find((p: any) => p.name === 'questionnaireResponse');
    expect(echoed).toBeDefined();
    const parsed = JSON.parse(echoed.valueString) as QuestionnaireResponse;
    expect(parsed.item?.[0]?.answer?.[0]?.valueString).toBe('Homer');
  });

  test('Stopping dictation calls stop and flushes the pending transcript', async () => {
    const { executeBotSpy } = await setup();
    executeBotSpy.mockResolvedValue(buildBotResponse({ resourceType: 'QuestionnaireResponse', status: 'in-progress' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Dictation' }));
    });
    await act(async () => {
      whisper.setStatus('listening');
    });
    await act(async () => {
      whisper.emitTranscript('final words');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop Dictation' }));
    });
    await act(async () => {});

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(executeBotSpy).toHaveBeenCalledTimes(1);
    expect(executeBotSpy.mock.calls[0][1].parameter.find((p: any) => p.name === 'transcript').valueString).toBe(
      'final words'
    );
  });

  test('Does not execute the bot when there is no transcript', async () => {
    const { executeBotSpy } = await setup();
    await act(async () => {
      whisper.setStatus('speech_stopped');
    });
    await act(async () => {
      jest.advanceTimersByTime(SILENCE_DEBOUNCE_MS);
    });
    await act(async () => {});
    expect(executeBotSpy).not.toHaveBeenCalled();
  });

  test('Does not flush while the user is still speaking', async () => {
    const { executeBotSpy } = await setup();
    await act(async () => {
      whisper.setStatus('speech_started');
    });
    await act(async () => {
      whisper.emitTranscript('still talking');
    });

    await act(async () => {
      whisper.setStatus('speech_stopped');
    });
    await act(async () => {
      whisper.setStatus('speech_started');
    });
    await act(async () => {
      jest.advanceTimersByTime(SILENCE_DEBOUNCE_MS);
    });
    await act(async () => {});
    expect(executeBotSpy).not.toHaveBeenCalled();
  });

  test('Renders custom voice instructions', async () => {
    await setup({ voiceInstructions: <div>Custom dictation guidance</div> });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand transcript' }));
    });
    expect(screen.getByText('Custom dictation guidance')).toBeInTheDocument();
  });

  test('Forwards onChange edits from the underlying QuestionnaireForm', async () => {
    const onChange = jest.fn();
    await setup({ onChange });
    const input = screen.getByDisplayValue('');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'typed answer' } });
    });
    expect(onChange).toHaveBeenCalled();
  });
});
