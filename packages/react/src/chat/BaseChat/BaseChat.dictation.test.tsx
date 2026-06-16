// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { createReference, getReferenceString } from '@medplum/core';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider, useWhisper } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import type { BaseChatProps } from './BaseChat';
import { BaseChat } from './BaseChat';

// Replace useWhisper with a controllable mock while keeping useDictation and the rest of react-hooks real.
vi.mock(import('@medplum/react-hooks'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useWhisper: vi.fn(),
  };
});

const mockUseWhisper = useWhisper as unknown as Mock;

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

let whisper: {
  setStatus: (status: WhisperStatus) => void;
  emitTranscript: (text: string) => void;
  start: Mock;
  stop: Mock;
};

let startMock: Mock;
let stopMock: Mock;

function setupWhisperMock(): void {
  let status: WhisperStatus = 'idle';
  let onTranscript: ((text: string) => void) | undefined;
  startMock = vi.fn().mockImplementation(async () => {
    status = 'listening';
    whisper.setStatus(status);
  });
  stopMock = vi.fn().mockImplementation(() => {
    status = 'idle';
    whisper.setStatus(status);
  });
  whisper = {
    setStatus: (next: WhisperStatus) => {
      status = next;
      mockUseWhisper.mockImplementation((options) => {
        if (options?.onTranscript) {
          onTranscript = options.onTranscript;
        }
        return {
          status,
          error: undefined,
          transcripts: [],
          start: startMock,
          stop: stopMock,
          isListening: status === 'listening' || status === 'speech_started',
          muted: false,
          setMuted: vi.fn(),
        };
      });
    },
    emitTranscript: (text: string) => onTranscript?.(text),
    start: startMock,
    stop: stopMock,
  };
  mockUseWhisper.mockImplementation((options) => {
    onTranscript = options.onTranscript;
    return {
      status,
      error: undefined,
      transcripts: [],
      start: startMock,
      stop: stopMock,
      isListening: status === 'listening' || status === 'speech_started',
      muted: false,
      setMuted: vi.fn(),
    };
  });
}

const homerReference = createReference(HomerSimpson);
const drAliceReference = createReference(DrAliceSmith);
const QUERY = `sender=${getReferenceString(homerReference)},${getReferenceString(drAliceReference)}&recipient=${getReferenceString(homerReference)},${getReferenceString(drAliceReference)}`;

function TestComponent(props: Omit<BaseChatProps, 'communications' | 'setCommunications'>): JSX.Element {
  const [communications, setCommunications] = useState<BaseChatProps['communications']>([]);
  return <BaseChat {...props} communications={communications} setCommunications={setCommunications} />;
}

async function setup(props: Omit<BaseChatProps, 'communications' | 'setCommunications'>): Promise<void> {
  const medplum = new MockClient({ profile: DrAliceSmith });
  await act(async () =>
    render(<TestComponent {...props} />, ({ children }) => (
      <MemoryRouter>
        <Notifications />
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    ))
  );
}

async function startDictationWithText(text: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /dictate/i }));
    await Promise.resolve();
  });
  act(() => {
    whisper.emitTranscript(text);
  });
}

describe('BaseChat dictation accept', () => {
  beforeEach(() => {
    setupWhisperMock();
  });

  test('Clicking Accept confirms the dictated text without sending', async () => {
    const sendMessage = vi.fn();
    await setup({ title: 'Test Chat', query: QUERY, sendMessage, dictationEnabled: true });
    await startDictationWithText('dictated but not ready to send');

    const acceptButton = screen.getByRole('button', { name: /accept dictated text/i });
    expect(acceptButton).toHaveAttribute('type', 'button');

    await act(async () => {
      fireEvent.click(acceptButton);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  test('Accept does not send when the Send button replaces Accept mid-click', async () => {
    const sendMessage = vi.fn();
    await setup({ title: 'Test Chat', query: QUERY, sendMessage, dictationEnabled: true });
    await startDictationWithText('dictated but not ready to send');

    const acceptButton = screen.getByRole('button', { name: /accept dictated text/i });
    fireEvent.mouseDown(acceptButton);
    fireEvent.click(acceptButton);
    fireEvent.mouseUp(acceptButton);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('Enter during dictation accepts without sending', async () => {
    const sendMessage = vi.fn();
    await setup({ title: 'Test Chat', query: QUERY, sendMessage, dictationEnabled: true });
    await startDictationWithText('dictated but not ready to send');

    const chatInput = screen.getByPlaceholderText('Start speaking—your transcribed words will appear here.');
    act(() => {
      fireEvent.keyDown(chatInput, { key: 'Enter', code: 'Enter' });
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });
});
