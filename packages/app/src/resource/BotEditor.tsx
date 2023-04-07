import { Button, Group } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import React, { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { sendCommand } from '../utils';
import { BotRunner } from './BotRunner';
import { CodeEditor } from './CodeEditor';

import './BotEditor.css';

export function BotEditor(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const bot = useResource<Bot>({ reference: 'Bot/' + id });
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
      await medplum.patchResource('Bot', id, [
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
      await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code });
      showNotification({ color: 'green', message: 'Deployed' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function executeBot(): Promise<void> {
    try {
      const input = await getSampleInput();
      const result = await medplum.post(medplum.fhirUrl('Bot', id, '$execute'), input);
      await sendCommand(outputFrameRef.current as HTMLIFrameElement, {
        command: 'setValue',
        value: result,
      });
      showNotification({ color: 'green', message: 'Success' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  if (!bot) {
    return null;
  }

  return (
    <div className="medplum-bot-editor">
      <CodeEditor
        iframeRef={codeFrameRef}
        className="medplum-bot-code-frame"
        language="typescript"
        module="commonjs"
        testId="code-frame"
        defaultValue={bot.code || ''}
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
        <Group position="right">
          <Button type="button" onClick={() => saveBot()}>
            Save
          </Button>
          <Button type="button" onClick={() => deployBot()}>
            Deploy
          </Button>
          <Button type="button" onClick={() => executeBot()}>
            Execute
          </Button>
        </Group>
      </div>
    </div>
  );
}
