// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Annotation } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type * as MedplumReact from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, userEvent } from '../../test-utils/render';
import { ClaimNoteInput } from './ClaimNoteInput';

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

describe('ClaimNoteInput', () => {
  let medplum: MockClient;
  let onAdd: Mock<(note: Annotation) => void>;

  beforeEach(() => {
    whisper.startCount = 0;
    whisper.stopCount = 0;
    medplum = new MockClient();
    medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'p', features: ['ai-realtime'] });
    onAdd = vi.fn();
  });

  function setup(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ClaimNoteInput onAdd={onAdd} />
      </MedplumProvider>
    );
  }

  const input = (): HTMLElement => screen.getByRole('textbox');

  test('swaps voice mode for the add button once there is text', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument();

    await user.type(input(), 'Called Aetna');
    expect(screen.queryByRole('button', { name: 'Start voice mode' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Note' }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ text: 'Called Aetna' }));
    expect(input()).toHaveValue('');
  });

  test('adds on Enter and starts a new line on Shift+Enter', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(input(), 'Line 1{Shift>}{Enter}{/Shift}Line 2');
    expect(onAdd).not.toHaveBeenCalled();
    await user.type(input(), '{Enter}');

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ text: 'Line 1\nLine 2' }));
  });

  test("doesn't add an empty note", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  test('disables voice mode without the ai-realtime feature', () => {
    medplum.getProject = vi.fn().mockReturnValue({ resourceType: 'Project', id: 'p', features: [] });
    setup();
    expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeDisabled();
  });

  test('records, then accepts the transcript for review and adding', async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' })));

    expect(whisper.startCount).toBe(1);
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    expect(input()).toHaveAttribute('placeholder', 'Start speaking—your transcribed words will appear here.');

    await act(async () => whisper.emitTranscript?.('Left a voicemail'));
    await act(async () => whisper.emitTranscript?.('  with the payer  '));
    expect(input()).toHaveValue('Left a voicemail with the payer');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Accept voice input' })));
    expect(whisper.stopCount).toBe(1);
    expect(input()).toHaveValue('Left a voicemail with the payer');
    expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();
  });

  test('cancelling discards what was transcribed', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), 'Before');
    await user.clear(input());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' })));
    await act(async () => whisper.emitTranscript?.('Never mind'));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel voice input' })));

    expect(whisper.stopCount).toBe(1);
    expect(input()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Start voice mode' })).toBeInTheDocument();
  });

  test('Enter while recording accepts and adds the transcript', async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' })));
    await act(async () => whisper.emitTranscript?.('Faxed the records'));

    await act(async () => fireEvent.keyDown(input(), { key: 'Enter' }));

    expect(whisper.stopCount).toBe(1);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ text: 'Faxed the records' }));
  });
});
