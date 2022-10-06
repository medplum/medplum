import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import React, { useRef } from 'react';
import { sendCommand } from '../utils';
import { BotRunner } from './BotRunner';
import { CodeEditor } from './CodeEditor';

import './BotEditor.css';

export interface BotEditorProps {
  bot: Bot;
}

export function BotEditor(props: BotEditorProps): JSX.Element {
  const medplum = useMedplum();
  const { bot } = props;
  const codeFrameRef = useRef<HTMLIFrameElement>(null);
  const inputFrameRef = useRef<HTMLIFrameElement>(null);
  const outputFrameRef = useRef<HTMLIFrameElement>(null);

  function getCode(): Promise<string> {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
  }

  function getCodeOutput(): Promise<string> {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getOutput' });
  }

  async function getSampleInput(): Promise<any> {
    const input = await sendCommand(inputFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
    return JSON.parse(input);
  }

  async function saveBot(): Promise<void> {
    try {
      const code = await getCode();
      await medplum.patchResource('Bot', bot.id as string, [
        {
          op: 'replace',
          path: '/code',
          value: code,
        },
      ]);
      showNotification({ color: 'green', message: 'Saved' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function deployBot(): Promise<void> {
    try {
      const code = await getCodeOutput();
      await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), { code });
      showNotification({ color: 'green', message: 'Deployed' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function executeBot(): Promise<void> {
    try {
      const input = await getSampleInput();
      const result = await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$execute'), input);
      await sendCommand(outputFrameRef.current as HTMLIFrameElement, {
        command: 'setValue',
        value: result,
      });
      showNotification({ color: 'green', message: 'Success' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  return (
    <div className="medplum-bot-editor">
      <CodeEditor
        iframeRef={codeFrameRef}
        className="medplum-bot-code-frame"
        language="typescript"
        module="commonjs"
        testId="code-frame"
        defaultValue={props.bot.code || ''}
      />
      <CodeEditor
        iframeRef={inputFrameRef}
        className="medplum-bot-input-frame"
        language="json"
        testId="input-frame"
        defaultValue={JSON.stringify(
          {
            resourceType: 'Patient',
            name: [{ given: ['Alice'], family: 'Smith' }],
          },
          null,
          2
        )}
      />
      <BotRunner iframeRef={outputFrameRef} className="medplum-bot-output-frame" testId="output-frame" />
      <div className="medplum-bot-buttons">
        <Button type="button" onClick={() => saveBot()}>
          Save
        </Button>
        <Button type="button" onClick={() => deployBot()}>
          Deploy
        </Button>
        <Button type="button" onClick={() => executeBot()}>
          Execute
        </Button>
      </div>
    </div>
  );
}
