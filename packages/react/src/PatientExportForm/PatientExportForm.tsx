// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Button,
  Center,
  CopyButton,
  Divider,
  Group,
  NativeSelect,
  Paper,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { SmartHealthLinkMode, SmartHealthLinkPayload } from '@medplum/core';
import {
  ContentType,
  createReference,
  formatHumanName,
  normalizeErrorString,
  parseSmartHealthLink,
  resolveId,
} from '@medplum/core';
import type { Parameters, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useResource } from '@medplum/react-hooks';
import { IconCheck, IconCopy, IconDownload, IconX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { FormSection } from '../FormSection/FormSection';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { SmartLogo } from '../SmartLogo/SmartLogo';
import classes from './PatientExportForm.module.css';
import { CARD_LAYOUT, getCardHeight, renderSmartHealthLinkCard } from './SmartHealthLinkCard';

export interface PatientExportFormRenderProps {
  readonly body: ReactNode;
  readonly actions: ReactNode;
  readonly onSubmit: (formData: Record<string, string>) => Promise<void>;
}

export interface PatientExportFormProps {
  readonly patient: Patient | Reference<Patient>;
  readonly children?: (props: PatientExportFormRenderProps) => ReactNode;
}

type PatientExportFormat = 'everything' | 'summary' | 'ccda' | 'smart';

const EXPORT_FORMATS: PatientExportFormat[] = ['everything', 'summary', 'ccda', 'smart'];

const NOTIFICATION_ID = 'patient-export';
const TOGGLE_PROPS = { fullWidth: true, radius: 'xl', styles: { indicator: { boxShadow: 'none' } } } as const;
const AUTHOR_TYPES: string[] = ['Organization', 'Practitioner', 'PractitionerRole'];
const NOTIFICATION_TITLE = 'Patient Export';

interface FormatDefinition {
  operation: string;
  extension: string;
  contentType: string;
}

const formats: Record<string, FormatDefinition> = {
  everything: {
    operation: '$everything',
    extension: 'json',
    contentType: ContentType.FHIR_JSON,
  },
  summary: {
    operation: '$summary',
    extension: 'json',
    contentType: ContentType.FHIR_JSON,
  },
  ccda: {
    operation: '$ccda-export',
    extension: 'xml',
    contentType: ContentType.CDA_XML,
  },
};

export function PatientExportForm(props: PatientExportFormProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, children } = props;
  const resolvedPatient = useResource(patient);
  const patientName = resolvedPatient ? formatHumanName(resolvedPatient.name?.[0]) : '';
  const [format, setFormat] = useState<PatientExportFormat>('everything');
  const [inlineAttachments, setInlineAttachments] = useState(false);
  const [ccdaType, setCcdaType] = useState<'summary' | 'referral'>('summary');
  const smart = useSmartHealthLinkExport(patient, patientName);
  const profile = useMedplumProfile();
  const defaultAuthor = profile && AUTHOR_TYPES.includes(profile.resourceType) ? createReference(profile) : undefined;

  const handleExport = useCallback(
    async (data: Record<string, string>) => {
      const patientId = resolveId(patient) as string;
      const { operation, contentType, extension } = formats[format];
      const url = medplum.fhirUrl('Patient', patientId, operation);
      const params = {} as Record<string, unknown>;

      if (format === 'everything' && inlineAttachments) {
        url.searchParams.set('_inlineAttachments', 'true');
      }

      if (format === 'ccda' && ccdaType === 'referral') {
        params.type = 'referral';
      }

      if (data.author) {
        params.author = { reference: data.author };
      }

      if (data.authoredOn) {
        params.authoredOn = data.authoredOn === today() ? new Date().toISOString() : startOfLocalDay(data.authoredOn);
      }

      if (data.startDate) {
        params.start = startOfLocalDay(data.startDate);
      }

      if (data.endDate) {
        params.end = startOfLocalDay(data.endDate, 1);
      }

      notifications.show({
        id: NOTIFICATION_ID,
        title: NOTIFICATION_TITLE,
        loading: true,
        message: 'Exporting...',
        autoClose: false,
        withCloseButton: false,
      });

      try {
        const response = await medplum.post(url, params, undefined, {
          cache: 'no-cache',
          headers: { Accept: contentType },
        });

        const fileName = `Patient-export-${patientId}-${new Date().toISOString().replaceAll(':', '-')}.${extension}`;

        saveData(response, fileName, contentType);

        notifications.update({
          id: NOTIFICATION_ID,
          title: NOTIFICATION_TITLE,
          color: 'green',
          message: 'Done',
          icon: <IconCheck size="1rem" />,
          loading: false,
          autoClose: true,
          withCloseButton: true,
        });
      } catch (err) {
        notifications.update({
          id: NOTIFICATION_ID,
          title: NOTIFICATION_TITLE,
          color: 'red',
          message: normalizeErrorString(err),
          icon: <IconX size="1rem" />,
          loading: false,
          autoClose: false,
          withCloseButton: true,
        });
      }
    },
    [medplum, patient, format, ccdaType, inlineAttachments]
  );

  const isSmart = format === 'smart';

  const renderPanel = (panelFormat: PatientExportFormat, sizer: boolean): ReactNode => {
    if (panelFormat === 'smart') {
      return sizer ? smart.form : smart.content;
    }
    return (
      <Stack gap="lg">
        {panelFormat === 'ccda' && (
          <FormSection
            title="Type"
            description={'Choose "Summarization of Episode Note" or "Referral Note" LOINC format'}
          >
            <SegmentedControl
              value={ccdaType}
              onChange={(value) => setCcdaType(value as 'summary' | 'referral')}
              data={[
                { value: 'summary', label: 'Standard Summary' },
                { value: 'referral', label: 'Referral Note' },
              ]}
              {...TOGGLE_PROPS}
            />
          </FormSection>
        )}
        <FormSection title="Author" description="Author shown on the exported document (usually you).">
          <ReferenceInput
            name={sizer ? '' : 'author'}
            placeholder={sizer ? undefined : 'Author'}
            targetTypes={AUTHOR_TYPES}
            defaultValue={defaultAuthor}
          />
        </FormSection>
        <FormSection title="Authored On" description="Date shown on the exported document (usually today).">
          <TextInput
            type="date"
            name={sizer ? undefined : 'authoredOn'}
            placeholder={sizer ? undefined : 'Authored on'}
            defaultValue={today()}
            max={today()}
          />
        </FormSection>
        <FormSection
          title="Start Date"
          description="The start date of care. If no start date is provided, all records prior to the end date are in scope."
        >
          <TextInput
            type="date"
            name={sizer ? undefined : 'startDate'}
            placeholder={sizer ? undefined : 'Start date'}
          />
        </FormSection>
        <FormSection
          title="End Date"
          description="The end date of care. If no end date is provided, all records subsequent to the start date are in scope."
        >
          <TextInput type="date" name={sizer ? undefined : 'endDate'} placeholder={sizer ? undefined : 'End date'} />
        </FormSection>
        {panelFormat === 'everything' && (
          <FormSection
            title="Attachments"
            description="Choose whether the export includes the patient’s document files or links to them."
          >
            <SegmentedControl
              value={inlineAttachments ? 'include' : 'link'}
              onChange={(value) => setInlineAttachments(value === 'include')}
              data={[
                { value: 'link', label: 'Link to Files Only' },
                { value: 'include', label: 'Include Files in Export' },
              ]}
              {...TOGGLE_PROPS}
            />
          </FormSection>
        )}
      </Stack>
    );
  };

  const body = (
    <Stack gap={0}>
      <Tabs
        variant="unstyled"
        classNames={{ root: classes.tabs, list: classes.tabsList, tab: classes.tab }}
        value={format}
        onChange={(value) => setFormat((value as PatientExportFormat | null) ?? 'everything')}
      >
        <Tabs.List>
          <Tabs.Tab value="everything">FHIR Everything</Tabs.Tab>
          <Tabs.Tab value="summary">Patient Summary</Tabs.Tab>
          <Tabs.Tab value="ccda">C-CDA</Tabs.Tab>
          <Tabs.Tab value="smart">SMART Health Card/Link</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Divider my="lg" />
      <div style={PANELS_STYLE}>
        <div key="active" style={PANEL_STYLE}>
          {renderPanel(format, false)}
        </div>
        {EXPORT_FORMATS.filter((f) => f !== format).map((f) => (
          <div key={f} style={SIZER_STYLE} aria-hidden inert>
            {renderPanel(f, true)}
          </div>
        ))}
      </div>
    </Stack>
  );

  const actions = isSmart ? (
    smart.actions
  ) : (
    <SubmitButton leftSection={<IconDownload size={16} />}>
      {patientName ? `Export ${toPossessive(patientName)} Records` : 'Export Records'}
    </SubmitButton>
  );

  const onSubmit = isSmart ? smart.generate : handleExport;

  if (children) {
    return <>{children({ body, actions, onSubmit })}</>;
  }

  return (
    <Form onSubmit={onSubmit}>
      <Stack>
        {body}
        <Group justify="right">{actions}</Group>
      </Stack>
    </Form>
  );
}

const SUCCESS_TIMEOUT_MS = 2000;

const PANELS_STYLE = { display: 'grid' };

const PANEL_STYLE = { gridArea: '1 / 1', minWidth: 0 };

const SIZER_STYLE = { ...PANEL_STYLE, visibility: 'hidden' } as const;

const NO_PRESS_EFFECT = { transform: 'none' };

const CARD_PREVIEW_STYLE = {
  border: '1px solid light-dark(rgba(0, 0, 0, 0.1), transparent)',
  borderRadius: 'var(--mantine-radius-sm)',
  boxShadow: '0 2px 3px rgba(0, 0, 0, 0.1)',
  transform: 'rotate(-1.5deg)',
  transition: 'opacity 200ms ease',
};

const CARD_PREVIEW_HIDDEN = { position: 'absolute', opacity: 0 } as const;

const CARD_PREVIEW_HEIGHT = 190;

const CARD_PREVIEW_WIDTH = Math.round((CARD_PREVIEW_HEIGHT * CARD_LAYOUT.width) / getCardHeight(1, 2));

const SMART_HEALTH_LINK_EXPIRATIONS = [
  { value: String(15 * 60), label: '15 min' },
  { value: String(60 * 60), label: '1 hour' },
  { value: String(24 * 60 * 60), label: '24 hours' },
  { value: String(48 * 60 * 60), label: '48 hours' },
  { value: String(7 * 24 * 60 * 60), label: '7 days' },
  { value: String(30 * 24 * 60 * 60), label: '30 days' },
];

interface GeneratedSmartHealthLink {
  label: string;
  shlink: string;
  qrCodeDataUrl?: string;
  payload: SmartHealthLinkPayload;
}

interface SmartHealthLinkExport {
  readonly form: ReactNode;
  readonly content: ReactNode;
  readonly actions: ReactNode;
  readonly generate: () => Promise<void>;
}

function useSmartHealthLinkExport(patient: Patient | Reference<Patient>, patientName: string): SmartHealthLinkExport {
  const medplum = useMedplum();
  const [label, setLabel] = useState<string>();
  const [passcode, setPasscode] = useState('');
  const [expiresInSeconds, setExpiresInSeconds] = useState(String(60 * 60));
  const [generated, setGenerated] = useState<GeneratedSmartHealthLink>();
  const [error, setError] = useState<string>();
  const [downloaded, setDownloaded] = useState(false);
  const { start: startDownloadedTimer, clear: clearDownloadedTimer } = useTimeout(
    () => setDownloaded(false),
    SUCCESS_TIMEOUT_MS
  );
  const labelValue = label ?? (patientName ? `${toPossessive(patientName)} Health Records` : 'Patient Health Records');

  const generate = useCallback(async (): Promise<void> => {
    const patientId = resolveId(patient);
    if (!patientId) {
      return;
    }
    setError(undefined);
    try {
      const exp = Math.floor(Date.now() / 1000) + Number(expiresInSeconds);
      const mode: SmartHealthLinkMode = passcode ? 'manifest' : 'direct';
      const response = await medplum.post<Parameters>(
        medplum.fhirUrl('Patient', patientId, '$generate-smart-health-link'),
        {
          mode,
          exp,
          label: labelValue,
          passcode: passcode || undefined,
          includeQrCode: true,
        },
        ContentType.JSON
      );
      const shlink = getParameterValue(response, 'shlink');
      if (!shlink) {
        throw new Error('Expected shlink parameter');
      }
      setGenerated({
        label: labelValue,
        shlink,
        qrCodeDataUrl: getParameterValue(response, 'qrCodeDataUrl'),
        payload: parseSmartHealthLink(shlink),
      });
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }, [medplum, patient, labelValue, passcode, expiresInSeconds]);

  const expiresOn = generated?.payload.exp ? formatExpiresOn(new Date(generated.payload.exp * 1000)) : undefined;

  const [card, setCard] = useState<{ url?: string }>();
  const [cardShown, setCardShown] = useState(false);
  useEffect(() => {
    if (!generated?.qrCodeDataUrl) {
      return undefined;
    }
    let url: string | undefined;
    let cancelled = false;
    renderSmartHealthLinkCard({
      label: generated.label,
      expires: expiresOn && `This SMART Health Card expires on ${expiresOn}`,
      qrCodeDataUrl: generated.qrCodeDataUrl,
      logoUrl: import.meta.env.MEDPLUM_LOGO_URL,
      fontFamily: getComputedStyle(document.body).fontFamily,
    })
      .then((blob) => {
        if (!cancelled) {
          url = blob && window.URL.createObjectURL(blob);
          setCard({ url });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setCard({});
        }
      });
    return () => {
      cancelled = true;
      if (url) {
        window.URL.revokeObjectURL(url);
      }
      setCard(undefined);
      setCardShown(false);
    };
  }, [generated, expiresOn]);

  const showDownloaded = useCallback((): void => {
    setDownloaded(true);
    clearDownloadedTimer();
    startDownloadedTimer();
  }, [clearDownloadedTimer, startDownloadedTimer]);

  const downloadCard = useCallback((): void => {
    const url = card?.url ?? generated?.qrCodeDataUrl;
    if (generated && url) {
      triggerDownload(url, `${generated.label}.png`);
      showDownloaded();
    }
  }, [generated, card, showDownloaded]);

  const form = (
    <Stack gap="lg">
      <TextInput label="Label" value={labelValue} onChange={(e) => setLabel(e.currentTarget.value)} />
      <PasswordInput
        label="Passcode (Optional)"
        description="Adding a passcode makes this a manifest link, which recipients open with the passcode. Without one, it’s a direct link anyone with the link can open until it expires."
        value={passcode}
        onChange={(e) => setPasscode(e.currentTarget.value)}
      />
      <NativeSelect
        label="Expires"
        description="The link stops working after this time."
        data={SMART_HEALTH_LINK_EXPIRATIONS}
        value={expiresInSeconds}
        onChange={(e) => setExpiresInSeconds(e.currentTarget.value)}
      />
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
    </Stack>
  );

  const content = generated ? (
    <Stack gap="lg">
      <SimpleGrid cols={generated.qrCodeDataUrl ? 2 : 1} spacing="md">
        {generated.qrCodeDataUrl && (
          <Stack gap="xs">
            <Text size="sm" fw={800}>
              SMART Health Card
            </Text>
            <Paper withBorder radius="md" p="md" shadow="none" flex={1}>
              <Stack gap="md" align="center" justify="space-between" h="100%">
                <Center h={218} pos="relative">
                  {card && !card.url ? (
                    <img src={generated.qrCodeDataUrl} alt="SMART Health Link QR code" height={CARD_PREVIEW_HEIGHT} />
                  ) : (
                    <>
                      {!cardShown && (
                        <Skeleton
                          w={CARD_PREVIEW_WIDTH}
                          h={CARD_PREVIEW_HEIGHT}
                          radius="sm"
                          style={{ transform: CARD_PREVIEW_STYLE.transform }}
                        />
                      )}
                      {card?.url && (
                        <img
                          src={card.url}
                          alt="SMART Health Card"
                          height={CARD_PREVIEW_HEIGHT}
                          onLoad={() => setCardShown(true)}
                          style={{ ...CARD_PREVIEW_STYLE, ...(cardShown ? undefined : CARD_PREVIEW_HIDDEN) }}
                        />
                      )}
                    </>
                  )}
                </Center>
                <Button
                  onClick={downloadCard}
                  variant="outline"
                  fullWidth
                  leftSection={downloaded ? <IconCheck size={16} /> : <IconDownload size={16} />}
                  style={NO_PRESS_EFFECT}
                >
                  {downloaded ? 'Download Started' : 'Download Card'}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}
        <Stack gap="xs">
          <Text size="sm" fw={800}>
            SMART Health Link
          </Text>
          <Paper withBorder radius="md" p="md" shadow="none" flex={1}>
            <Stack gap="md" justify="space-between" h="100%">
              <Text ff="monospace" fz={11} lh="17.05px" style={{ wordBreak: 'break-all' }}>
                {generated.shlink}
              </Text>
              <CopyButton value={generated.shlink} timeout={SUCCESS_TIMEOUT_MS}>
                {({ copied, copy }) => (
                  <Button
                    variant="outline"
                    fullWidth
                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    onClick={copy}
                    style={NO_PRESS_EFFECT}
                  >
                    {copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                )}
              </CopyButton>
            </Stack>
          </Paper>
        </Stack>
      </SimpleGrid>
      {expiresOn && (
        <Text size="sm" c="dimmed" ta="center">
          This SMART Health Card/Link expires on {expiresOn}
        </Text>
      )}
    </Stack>
  ) : (
    form
  );

  const actions = generated ? (
    <Button
      variant="default"
      leftSection={<SmartLogo size={16} />}
      onClick={() => {
        setGenerated(undefined);
        setDownloaded(false);
        clearDownloadedTimer();
      }}
    >
      New SMART Health Card/Link
    </Button>
  ) : (
    <SubmitButton leftSection={<SmartLogo size={16} />}>
      {patientName ? `Generate ${toPossessive(patientName)} SMART Health Card/Link` : 'Generate SMART Health Card/Link'}
    </SubmitButton>
  );

  return { form, content, actions, generate };
}

function toPossessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

function getParameterValue(parameters: Parameters, name: string): string | undefined {
  const parameter = parameters.parameter?.find((p) => p.name === name);
  return parameter?.valueString ?? parameter?.valueId ?? parameter?.valueUri;
}

/**
 * Tricks the browser into downloading a file.
 *
 * This function creates a temporary anchor (<a>) element, converts the provided data to a Blob,
 * and then simulates a click on the link to trigger a file download in the browser.
 *
 * See: https://stackoverflow.com/a/19328891
 *
 * @param data - The data to save.
 * @param fileName - The name of the file.
 * @param contentType - The content type of the file.
 */
function saveData(data: unknown, fileName: string, contentType: string): void {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  window.URL.revokeObjectURL(url);
}

function formatExpiresOn(date: Date): string {
  const day = date.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

function today(): string {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

function startOfLocalDay(date: string, offsetDays = 0): string {
  const day = new Date(`${date}T00:00`);
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString();
}

function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  a.click();
  a.remove();
}
