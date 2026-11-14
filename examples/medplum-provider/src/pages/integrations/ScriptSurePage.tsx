// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Center, Loader, Tabs, useComputedColorScheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { ScriptSureReportWidget } from '@medplum/scriptsure-react';
import { useScriptSureIFrame, useScriptSureWidgetUrl } from '@medplum/scriptsure-react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getErrorMessage } from '../../components/insurance/utils';
import { applyDarkmode } from '../../components/meds/applyDarkmode';
import {
  getScriptSureReportWidget,
  isScriptSureReportWidget,
  SCRIPTSURE_REPORT_WIDGETS,
} from '../../scriptsure/reportWidgets';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
import classes from './EPrescribingPage.module.css';

const PRESCRIBING_TAB = 'prescribing';

const IFRAME_STYLE = { width: '100%', height: '100%', border: 'none', display: 'block' } as const;

export function ScriptSurePage(): JSX.Element {
  const { loading: practiceLoading } = useScriptSurePractice();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const reportWidget = isScriptSureReportWidget(tabParam) ? tabParam : undefined;

  // The prescribing iframe mounts on its first visit and then stays mounted (hidden), so switching
  // tabs keeps an in-progress prescription without loading it at 0×0 behind a deep-linked report.
  const [prescribingVisited, setPrescribingVisited] = useState(!reportWidget);
  if (!reportWidget && !prescribingVisited) {
    setPrescribingVisited(true);
  }

  const handleTabChange = (value: string | null): void => {
    setSearchParams(isScriptSureReportWidget(value) ? { tab: value } : {}, { replace: true });
  };

  return (
    <Box className={classes.container}>
      <Tabs value={reportWidget ?? PRESCRIBING_TAB} onChange={handleTabChange} className={classes.tabBar}>
        <Tabs.List px="md">
          <Tabs.Tab value={PRESCRIBING_TAB}>Prescribing</Tabs.Tab>
          {SCRIPTSURE_REPORT_WIDGETS.map(({ widget, label }) => (
            <Tabs.Tab key={widget} value={widget}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {/* The selected practice can change once affiliations load; waiting avoids a second session per iframe. */}
      {practiceLoading ? (
        <Center mt="xl">
          <Loader />
        </Center>
      ) : (
        <>
          {prescribingVisited && (
            <Box className={classes.iframeContainer} display={reportWidget ? 'none' : undefined}>
              <ScriptSurePrescribingFrame />
            </Box>
          )}
          {reportWidget && (
            <Box className={classes.iframeContainer}>
              <ScriptSureReportFrame key={reportWidget} widget={reportWidget} />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function ScriptSurePrescribingFrame(): JSX.Element | null {
  const { selectedOrganization } = useScriptSurePractice();
  const iframeUrl = useScriptSureIFrame({
    organization: selectedOrganization,
    onIframeSuccess: () =>
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully connected to ScriptSure',
        message: '',
      }),
    onError: (err) =>
      showNotification({ color: 'red', title: 'Error', message: getErrorMessage(err), autoClose: false }),
  });

  // The bot returns a UI-agnostic URL; the app appends `darkmode=on|off` once
  // per iframe load (theme toggles mid-session intentionally do not reload
  // the iframe so any in-progress state is preserved — `colorScheme` is
  // deliberately omitted from the memo deps).
  const colorScheme = useComputedColorScheme('light');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderedUrl = useMemo(() => applyDarkmode(iframeUrl, colorScheme), [iframeUrl]);

  if (!renderedUrl) {
    return null;
  }
  return (
    <iframe
      id="scriptsure-iframe"
      name="scriptsure-iframe"
      title="ScriptSure e-Prescribing"
      src={renderedUrl}
      style={IFRAME_STYLE}
    />
  );
}

function ScriptSureReportFrame({ widget }: { readonly widget: ScriptSureReportWidget }): JSX.Element | null {
  const { getWidgetUrl } = useScriptSureWidgetUrl();
  const { selectedOrganization } = useScriptSurePractice();
  const colorScheme = useComputedColorScheme('light');
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const { title } = getScriptSureReportWidget(widget);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await getWidgetUrl(widget, selectedOrganization);
        if (!cancelled) {
          // Theme is applied once per load; a mid-session toggle must not reload the widget.
          setUrl(applyDarkmode(next, colorScheme));
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      }
    };
    load().catch(console.error);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getWidgetUrl, widget, selectedOrganization, attempt]);

  const retry = (): void => {
    setError(undefined);
    setAttempt((n) => n + 1);
  };

  if (error) {
    return (
      <Alert m="md" color="red" icon={<IconAlertCircle size={16} />} title={`Could not open ${title}`}>
        {error}
        <Box mt="sm">
          <Button size="xs" variant="light" color="red" onClick={retry}>
            Retry
          </Button>
        </Box>
      </Alert>
    );
  }
  if (!url) {
    return (
      <Center mt="xl">
        <Loader />
      </Center>
    );
  }
  return <iframe title={title} src={url} style={IFRAME_STYLE} />;
}
