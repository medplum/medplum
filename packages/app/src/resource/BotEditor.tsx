import { Button, Grid, Group, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, PatchOperation } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCloudUpload, IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { sendCommand } from '../utils';
import { BotRunner } from './BotRunner';
import { CodeEditor } from './CodeEditor';

export function BotEditor(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const [bot, setBot] = useState<Bot>();
  const [defaultCode, setDefaultCode] = useState<string | undefined>(undefined);
  const codeFrameRef = useRef<HTMLIFrameElement>(null);
  const inputFrameRef = useRef<HTMLIFrameElement>(null);
  const outputFrameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    medplum
      .readResource('Bot', id)
      .then(async (newBot: Bot) => {
        setBot(newBot);
        setDefaultCode(await getBotCode(newBot));
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum, id]);

  const getCode = useCallback(() => {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
  }, [codeFrameRef]);

  const getCodeOutput = useCallback(() => {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getOutput' });
  }, [codeFrameRef]);

  const getSampleInput = useCallback(async () => {
    const input = await sendCommand(inputFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
    return JSON.parse(input);
  }, [inputFrameRef]);

  const saveBot = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      try {
        const code = await getCode();
        const sourceCode = await medplum.createAttachment(code, 'index.ts', 'application/typescript');
        const operations: PatchOperation[] = [];
        if (bot?.sourceCode) {
          operations.push({
            op: 'replace',
            path: '/sourceCode',
            value: sourceCode,
          });
        } else {
          operations.push({
            op: 'add',
            path: '/sourceCode',
            value: sourceCode,
          });
        }
        if (bot?.code) {
          operations.push({
            op: 'remove',
            path: '/code',
          });
        }
        await medplum.patchResource('Bot', id, operations);
        showNotification({ color: 'green', message: 'Saved' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, bot, getCode]
  );

  const deployBot = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      try {
        const code = await getCodeOutput();
        await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code });
        showNotification({ color: 'green', message: 'Deployed' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, getCodeOutput]
  );

  const executeBot = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
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
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, getSampleInput]
  );

  if (!bot) {
    return null;
  }

  return (
    <Grid m={0} gutter={0} style={{ overflow: 'hidden' }}>
      <Grid.Col span={8}>
        <Paper m={2} pb="xs" pr="xs" pt="xs" shadow="md" mih={400}>
          <CodeEditor
            iframeRef={codeFrameRef}
            language="typescript"
            module="commonjs"
            testId="code-frame"
            defaultValue={defaultCode}
            minHeight="528px"
          />
          <Group position="right" spacing="xs">
            <Button type="button" onClick={saveBot} loading={loading} leftIcon={<IconDeviceFloppy size="1rem" />}>
              Save
            </Button>
            <Button type="button" onClick={deployBot} loading={loading} leftIcon={<IconCloudUpload size="1rem" />}>
              Deploy
            </Button>
            <Button type="button" onClick={executeBot} loading={loading} leftIcon={<IconPlayerPlay size="1rem" />}>
              Execute
            </Button>
          </Group>
        </Paper>
      </Grid.Col>
      <Grid.Col span={4}>
        <Paper m={2} pb="xs" pr="xs" pt="xs" shadow="md">
          <CodeEditor
            iframeRef={inputFrameRef}
            language="json"
            testId="input-frame"
            minHeight="300px"
            defaultValue={JSON.stringify(
              {
                resourceType: 'Patient',
                name: [{ given: ['Alice'], family: 'Smith' }],
              },
              null,
              2
            )}
          />
        </Paper>
        <Paper m={2} p="xs" shadow="md">
          <BotRunner
            iframeRef={outputFrameRef}
            className="medplum-bot-output-frame"
            testId="output-frame"
            minHeight="200px"
          />
        </Paper>
      </Grid.Col>
    </Grid>
  );
}

async function getBotCode(bot: Bot): Promise<string | undefined> {
  if (bot.sourceCode?.url) {
    // Fetch the source code contents
    const response = await fetch(bot.sourceCode.url);
    const text = await response.text();
    return text;
  }

  return bot.code;
}
