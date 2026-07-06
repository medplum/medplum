// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Button, Center, Group, Loader, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { MedplumClient, PatchOperation } from '@medplum/core';
import { ContentType, isUUID, normalizeErrorString } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MedplumLink, sendCommand, useMedplum } from '@medplum/react';
import { IconCloudUpload, IconDeviceFloppy, IconExternalLink } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CodeEditor } from '../resource/CodeEditor';

export interface BotCodePanelProps {
  readonly bot: Bot;
}

/**
 * An inline, Supabase-inspired code editor for the Bot backing a custom operation.
 * Loads the current source code, and lets the user save and deploy without
 * leaving the custom operations workflow.
 * @param props - The panel props.
 * @returns The code panel.
 */
export function BotCodePanel(props: BotCodePanelProps): JSX.Element {
  const { bot } = props;
  const medplum = useMedplum();
  const [defaultCode, setDefaultCode] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const codeFrameRef = useRef<HTMLIFrameElement>(null);

  const module = bot.runtimeVersion === 'vmcontext' ? 'commonjs' : 'esnext';

  useEffect(() => {
    setLoading(true);
    getBotCode(medplum, bot)
      .then((code) => setDefaultCode(code))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setLoading(false));
  }, [medplum, bot]);

  const saveBot = useCallback(async () => {
    if (!bot.id) {
      return;
    }
    setSaving(true);
    try {
      const code = await sendCommand<undefined, string>(codeFrameRef.current as HTMLIFrameElement, {
        command: 'getValue',
      });
      const codeOutput = await sendCommand<undefined, string>(codeFrameRef.current as HTMLIFrameElement, {
        command: 'getOutput',
      });
      const sourceCode = await medplum.createAttachment({
        data: code,
        filename: 'index.ts',
        contentType: ContentType.TYPESCRIPT,
      });
      const executableCode = await medplum.createAttachment({
        data: codeOutput,
        filename: module === 'commonjs' ? 'index.cjs' : 'index.mjs',
        contentType: ContentType.JAVASCRIPT,
      });
      const operations: PatchOperation[] = [
        { op: 'add', path: '/sourceCode', value: sourceCode },
        { op: 'add', path: '/executableCode', value: executableCode },
      ];
      await medplum.patchResource('Bot', bot.id, operations);
      showNotification({ color: 'green', message: 'Saved' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }, [medplum, bot.id, module]);

  const deployBot = useCallback(async () => {
    if (!bot.id) {
      return;
    }
    setDeploying(true);
    try {
      await medplum.post(medplum.fhirUrl('Bot', bot.id, '$deploy'));
      showNotification({ color: 'green', message: 'Deployed' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setDeploying(false);
    }
  }, [medplum, bot.id]);

  return (
    <Box>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs">
          <Text fw={500} size="sm">
            {bot.name ?? 'Bot'}
          </Text>
          <Badge size="xs" variant="light" color="gray">
            {module === 'commonjs' ? 'commonjs' : 'esnext'}
          </Badge>
          <MedplumLink to={`/Bot/${bot.id}/editor`}>
            <Group gap={4}>
              <Text size="xs">Full editor</Text>
              <IconExternalLink size={12} />
            </Group>
          </MedplumLink>
        </Group>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={saving}
            disabled={loading}
            onClick={() => saveBot().catch(console.error)}
          >
            Save
          </Button>
          <Button
            size="xs"
            leftSection={<IconCloudUpload size={14} />}
            loading={deploying}
            disabled={loading}
            onClick={() => deployBot().catch(console.error)}
          >
            Deploy
          </Button>
        </Group>
      </Group>

      <Box
        style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
          minHeight: 480,
        }}
      >
        {loading ? (
          <Center h={480}>
            <Loader size="sm" />
          </Center>
        ) : (
          <CodeEditor
            iframeRef={codeFrameRef}
            language="typescript"
            module={module}
            defaultValue={defaultCode ?? ''}
            minHeight="480px"
          />
        )}
      </Box>
    </Box>
  );
}

async function getBotCode(medplum: MedplumClient, bot: Bot): Promise<string> {
  if (bot.sourceCode?.url) {
    // Medplum storage service does not allow CORS requests, so fetch the source
    // through the FHIR Binary API. The Binary ID is the first UUID in the URL.
    const binaryId = bot.sourceCode.url.split('/').find(isUUID) as string;
    const blob = await medplum.download(medplum.fhirUrl('Binary', binaryId));
    return blob.text();
  }
  return bot.code ?? '';
}
