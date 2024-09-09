import { Button, Grid, Group, JsonInput, NativeSelect, Paper } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType, MedplumClient, PatchOperation, isUUID, normalizeErrorString } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCloudUpload, IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import { SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { sendCommand } from '../utils';
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

export function BotEditor(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const [bot, setBot] = useState<Bot>();
  const [defaultCode, setDefaultCode] = useState<string>();
  const [fhirInput, setFhirInput] = useState(DEFAULT_FHIR_INPUT);
  const [hl7Input, setHl7Input] = useState(DEFAULT_HL7_INPUT);
  const [contentType, setContentType] = useState<string>(ContentType.FHIR_JSON);
  const codeFrameRef = useRef<HTMLIFrameElement>(null);
  const outputFrameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    medplum
      .readResource('Bot', id)
      .then(async (newBot: Bot) => {
        setBot(newBot);
        setDefaultCode(await getBotCode(medplum, newBot));
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, id]);

  const getCode = useCallback(() => {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getValue' });
  }, []);

  const getCodeOutput = useCallback(() => {
    return sendCommand(codeFrameRef.current as HTMLIFrameElement, { command: 'getOutput' });
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
        const sourceCode = await medplum.createAttachment(code, 'index.ts', 'text/typescript');
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
        await medplum.patchResource('Bot', id, operations);
        showNotification({ color: 'green', message: 'Saved' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, bot, getCode]
  );

  const deployBot = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
      try {
        const code = await getCodeOutput();
        await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code });
        showNotification({ color: 'green', message: 'Deployed' });
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      } finally {
        setLoading(false);
      }
    },
    [medplum, id, getCodeOutput]
  );

  const executeBot = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setLoading(true);
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
            module="commonjs"
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
            <Button type="button" onClick={executeBot} loading={loading} leftSection={<IconPlayerPlay size="1rem" />}>
              Execute
            </Button>
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
