// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Grid,
  Group,
  JsonInput,
  Menu,
  NativeSelect,
  Paper,
  ScrollArea,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { MedplumClient, PatchOperation } from '@medplum/core';
import {
  ContentType,
  isUUID,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { sendCommand, useMedplum } from '@medplum/react';
import { IconBolt, IconChevronDown, IconCloudUpload, IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import type { JSX, SyntheticEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import classes from './BotEditor.module.css';
import { BotRunner } from './BotRunner';
import { CodeEditor } from './CodeEditor';

const DEFAULT_FHIR_INPUT = `{
  "resourceType": "Patient",
  "name": [
    {
      "given": [
        "Alice"
      ],
      "family": "Smith"
    }
  ]
}`;

const DEFAULT_HL7_INPUT =
  'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT|MSG00001|P|2.1\r' +
  'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
  'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
  'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';

interface SseEvent {
  readonly key: number;
  readonly event?: string;
  readonly data: string;
}

export function BotEditor(): JSX.Element | null {
  const medplum = useMedplum();
  const theme = useMantineTheme();
  const { id } = useParams() as { id: string };
  const [bot, setBot] = useState<Bot>();
  const [module, setModule] = useState<'commonjs' | 'esnext'>();
  const [defaultCode, setDefaultCode] = useState<string>();
  const [fhirInput, setFhirInput] = useState(DEFAULT_FHIR_INPUT);
  const [hl7Input, setHl7Input] = useState(DEFAULT_HL7_INPUT);
  const [contentType, setContentType] = useState(ContentType.FHIR_JSON as string);
  const codeFrameRef = useRef<HTMLIFrameElement>(null);
  const outputFrameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);
  // The action taken by the primary Execute button. Defaults to 'sse' for streaming-enabled bots.
  const [executeMode, setExecuteMode] = useState<'sync' | 'sse'>('sync');
  // When defined, the bot was last executed with server-sent events, and we show the stream of events
  // instead of the normal output frame. `undefined` means we are in normal (synchronous) execute mode.
  const [sseEvents, setSseEvents] = useState<SseEvent[]>();

  useEffect(() => {
    medplum
      .readResource('Bot', id)
      .then(async (newBot: Bot) => {
        setBot(newBot);
        setExecuteMode(newBot.streamingEnabled ? 'sse' : 'sync');
        setModule(newBot.runtimeVersion === 'vmcontext' ? 'commonjs' : 'esnext');
        setDefaultCode(await getBotCode(medplum, newBot));
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, id]);

  // Gets the uncompiled TS code
  const getCode = useCallback(async () => {
    return sendCommand<undefined, string>(codeFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
  }, []);

  // Gets the compiled JS output
  const getCodeOutput = useCallback(async () => {
    return sendCommand<undefined, string>(codeFrameRef.current as HTMLIFrameElement, { command: 'getOutput' });
  }, []);

  const getSampleInput = useCallback(async () => {
    if (contentType === ContentType.FHIR_JSON) {
      return JSON.parse(fhirInput);
    } else {
      return hl7Input;
    }
  }, [contentType, fhirInput, hl7Input]);

  const saveBot = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      try {
        const code = await getCode();
        const codeOutput = await getCodeOutput();
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
          {
            op: 'add',
            path: '/sourceCode',
            value: sourceCode,
          },
          {
            op: 'add',
            path: '/executableCode',
            value: executableCode,
          },
        ];
        await medplum.patchResource('Bot', id, operations);
        showNotification({ color: 'green', message: 'Saved' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, module, getCode, getCodeOutput]
  );

  const deployBot = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      try {
        await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'));
        showNotification({ color: 'green', message: 'Deployed' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id]
  );

  const executeBot = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      setSseEvents(undefined);
      try {
        const input = await getSampleInput();
        const result = await medplum.post(medplum.fhirUrl('Bot', id, '$execute'), input, contentType);
        await sendCommand(outputFrameRef.current as HTMLIFrameElement, {
          command: 'setValue',
          value: result,
        });
        showNotification({ color: 'green', message: 'Success' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, getSampleInput, contentType]
  );

  const executeBotSSE = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      // Switch the output panel into SSE mode and clear any previous events
      setSseEvents([]);
      let key = 0;
      try {
        const input = await getSampleInput();
        const body = contentType === ContentType.FHIR_JSON ? JSON.stringify(input) : (input as string);
        const response = await medplum.downloadResponse(medplum.fhirUrl('Bot', id, '$execute'), {
          method: 'POST',
          body,
          headers: {
            'Content-Type': contentType,
            Accept: ContentType.EVENT_STREAM,
          },
        });

        if (!response.ok) {
          // Mirror executeBot: surface the error returned by the server (e.g. an OperationOutcome)
          const errorText = await response.text();
          let errorBody: unknown = errorText;
          try {
            errorBody = JSON.parse(errorText);
          } catch {
            // Response was not JSON; fall back to the raw text
          }
          throw new OperationOutcomeError(normalizeOperationOutcome(errorBody));
        }

        if (!response.body) {
          throw new Error('Streaming is not supported in this environment');
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          // Normalize line endings and split complete events on the blank line delimiter
          buffer += value.replace(/\r\n/g, '\n');
          let delimiter = buffer.indexOf('\n\n');
          while (delimiter !== -1) {
            const raw = buffer.slice(0, delimiter);
            buffer = buffer.slice(delimiter + 2);
            const parsed = parseSseEvent(raw);
            if (parsed) {
              const event: SseEvent = { key: key++, ...parsed };
              setSseEvents((prev) => [...(prev ?? []), event]);
            }
            delimiter = buffer.indexOf('\n\n');
          }
        }

        showNotification({ color: 'green', message: 'Stream complete' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, getSampleInput, contentType]
  );

  if (!bot || defaultCode === undefined) {
    return null;
  }

  return (
    <Grid m={0} gutter={0} style={{ overflow: 'hidden' }}>
      <Grid.Col span={8}>
        <Paper m={2} pb="xs" pr="xs" pt="xs" shadow="md" mih={400}>
          <CodeEditor
            iframeRef={codeFrameRef}
            language="typescript"
            module={module}
            testId="code-frame"
            defaultValue={defaultCode}
            minHeight="528px"
          />
          <Group justify="flex-end" gap="xs">
            <Button type="button" onClick={saveBot} loading={loading} leftSection={<IconDeviceFloppy size="1rem" />}>
              Save
            </Button>
            <Button type="button" onClick={deployBot} loading={loading} leftSection={<IconCloudUpload size="1rem" />}>
              Deploy
            </Button>
            <Group wrap="nowrap" gap={0}>
              <Button
                type="button"
                onClick={executeMode === 'sse' ? executeBotSSE : executeBot}
                loading={loading}
                leftSection={executeMode === 'sse' ? <IconBolt size="1rem" /> : <IconPlayerPlay size="1rem" />}
                className={classes.splitButton}
              >
                {executeMode === 'sse' ? 'Execute SSE' : 'Execute'}
              </Button>
              <Menu transitionProps={{ transition: 'pop' }} position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="filled"
                    color={theme.primaryColor}
                    size={36}
                    className={classes.menuControl}
                    aria-label="Execute options"
                    loading={loading}
                  >
                    <IconChevronDown size={14} stroke={1.5} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {executeMode === 'sse' ? (
                    <Menu.Item
                      leftSection={<IconPlayerPlay size={14} stroke={1.5} />}
                      onClick={(e) => {
                        setExecuteMode('sync');
                        return executeBot(e);
                      }}
                    >
                      Execute
                    </Menu.Item>
                  ) : (
                    <Menu.Item
                      leftSection={<IconBolt size={14} stroke={1.5} />}
                      onClick={(e) => {
                        setExecuteMode('sse');
                        return executeBotSSE(e);
                      }}
                    >
                      Execute SSE
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Paper>
      </Grid.Col>
      <Grid.Col span={4}>
        <Paper m={2} pb="xs" pr="xs" pt="xs" shadow="md">
          <NativeSelect
            data={[
              { label: 'FHIR', value: ContentType.FHIR_JSON },
              { label: 'HL7', value: ContentType.HL7_V2 },
            ]}
            onChange={(e) => setContentType(e.currentTarget.value)}
          />
          {contentType === ContentType.FHIR_JSON ? (
            <JsonInput value={fhirInput} onChange={(newValue) => setFhirInput(newValue)} autosize minRows={15} />
          ) : (
            <textarea
              className={classes.hl7Input}
              value={hl7Input}
              onChange={(e) => setHl7Input(e.currentTarget.value)}
              rows={15}
            />
          )}
        </Paper>
        <Paper m={2} p="xs" shadow="md">
          {sseEvents === undefined ? (
            <BotRunner
              iframeRef={outputFrameRef}
              className="medplum-bot-output-frame"
              testId="output-frame"
              minHeight="200px"
            />
          ) : (
            <SseEventViewer events={sseEvents} loading={loading} />
          )}
        </Paper>
      </Grid.Col>
    </Grid>
  );
}

interface SseEventViewerProps {
  readonly events: SseEvent[];
  readonly loading: boolean;
}

function SseEventViewer(props: SseEventViewerProps): JSX.Element {
  const { events, loading } = props;
  return (
    <Stack gap="xs" data-testid="sse-output">
      <Group justify="space-between">
        <Text fw={500} size="sm">
          Event stream
        </Text>
        <Badge color={loading ? 'blue' : 'gray'} variant="light">
          {loading ? 'Listening' : 'Closed'} · {events.length}
        </Badge>
      </Group>
      <ScrollArea.Autosize mah={400} type="auto">
        {events.length === 0 ? (
          <Text c="dimmed" size="sm">
            {loading ? 'Waiting for events…' : 'No events received.'}
          </Text>
        ) : (
          <Stack gap="xs">
            {events.map((event) => (
              <Code block className={classes.eventData}>
                {event.data}
              </Code>
            ))}
          </Stack>
        )}
      </ScrollArea.Autosize>
    </Stack>
  );
}

/**
 * Parses a single raw server-sent event block (the text between blank-line delimiters)
 * into its `event` type and concatenated `data` payload.
 * See: https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 * @param raw - The raw event block, with lines separated by `\n`.
 * @returns The parsed event, or undefined if the block contains no usable fields (e.g. only comments).
 */
function parseSseEvent(raw: string): { event?: string; data: string } | undefined {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) {
      // Blank line or comment
      continue;
    }
    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }
  if (event === undefined && dataLines.length === 0) {
    return undefined;
  }
  return { event, data: dataLines.join('\n') };
}

async function getBotCode(medplum: MedplumClient, bot: Bot): Promise<string> {
  if (bot.sourceCode?.url) {
    // Medplum storage service does not allow CORS requests for security reasons.
    // So instead, we have to use the FHIR Binary API to fetch the source code.
    // Example: https://storage.staging.medplum.com/binary/272a11dc-5b01-4c05-a14e-5bf53117e1e9/69303e8d-36f2-4417-b09b-60c15f221b09?Expires=...
    // The Binary ID is the first UUID in the URL.
    const binaryId = bot.sourceCode.url?.split('/')?.find(isUUID) as string;
    const blob = await medplum.download(medplum.fhirUrl('Binary', binaryId));
    return blob.text();
  }

  return bot.code ?? '';
}
