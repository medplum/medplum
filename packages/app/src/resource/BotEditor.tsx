import { Button, Grid, Group, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
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
  const codeFrameRef = useRef<HTMLIFrameElement>(null);
  const inputFrameRef = useRef<HTMLIFrameElement>(null);
  const outputFrameRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    medplum
      .readResource('Bot', id)
      .then(setBot)
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
      setSaving(true);
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
      } finally {
        setSaving(false);
      }
    },
    [medplum, id, getCode]
  );

  const deployBot = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDeploying(true);
      try {
        const code = await getCodeOutput();
        await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code });
        showNotification({ color: 'green', message: 'Deployed' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      } finally {
        setDeploying(false);
      }
    },
    [medplum, id, getCodeOutput]
  );

  const executeBot = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setExecuting(true);
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
        setExecuting(false);
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
            defaultValue={bot.code || ''}
            minHeight="528px"
          />
          <Group position="right" spacing="xs">
            <Button type="button" onClick={saveBot} loading={saving} leftIcon={<IconDeviceFloppy size="1rem" />}>
              Save
            </Button>
            <Button type="button" onClick={deployBot} loading={deploying} leftIcon={<IconCloudUpload size="1rem" />}>
              Deploy
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
          <Group position="right">
            <Button type="button" onClick={executeBot} loading={executing} leftIcon={<IconPlayerPlay size="1rem" />}>
              Execute
            </Button>
          </Group>
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
