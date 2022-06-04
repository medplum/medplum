import { Bot } from '@medplum/fhirtypes';
import { Button, useMedplum } from '@medplum/react';
import React, { useRef } from 'react';
import { BotRunner } from './BotRunner';
import { CodeEditor } from './CodeEditor';
import { sendCommand } from './utils';
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
    const code = await getCode();
    medplum.patchResource('Bot', bot.id as string, [
      {
        op: 'replace',
        path: '/code',
        value: code,
      },
    ]);
  }

  async function simulateBot(): Promise<void> {
    const code = await getCodeOutput();
    const input = await getSampleInput();
    const result = await sendCommand(outputFrameRef.current as HTMLIFrameElement, {
      command: 'execute',
      baseUrl: medplum.getBaseUrl(),
      accessToken: medplum.getAccessToken(),
      code,
      input,
    });
    console.log(result);
  }

  async function deployBot(): Promise<void> {
    const code = await getCodeOutput();
    medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), { code });
  }

  async function executeBot(): Promise<void> {
    const input = await getSampleInput();
    const result = await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$execute'), input);
    await sendCommand(outputFrameRef.current as HTMLIFrameElement, {
      command: 'setValue',
      value: result,
    });
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
        onChange={console.log}
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
        onChange={console.log}
      />
      <BotRunner iframeRef={outputFrameRef} className="medplum-bot-output-frame" testId="output-frame" />
      <div className="medplum-bot-buttons">
        <Button type="button" onClick={() => saveBot()}>
          Save
        </Button>
        <Button type="button" onClick={() => simulateBot()}>
          Simulate
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
