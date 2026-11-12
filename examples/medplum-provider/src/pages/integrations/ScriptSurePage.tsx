// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Tabs, useComputedColorScheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { ScriptSureReportWidget } from '@medplum/scriptsure-react';
import { useScriptSureIFrame, useScriptSureWidgetUrl } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getErrorMessage } from '../../components/insurance/utils';
import { applyDarkmode } from '../../components/meds/applyDarkmode';
import { isScriptSureReportWidget, SCRIPTSURE_REPORT_WIDGETS } from '../../scriptsure/reportWidgets';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
import classes from './EPrescribingPage.module.css';

const PRESCRIBING_TAB = 'prescribing';

const IFRAME_STYLE = { width: '100%', height: '100%', border: 'none', display: 'block' } as const;

export function ScriptSurePage(): JSX.Element {
  const { selectedOrganization } = useScriptSurePractice();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const reportWidget = isScriptSureReportWidget(tabParam) ? tabParam : undefined;

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
      {/* Hidden rather than unmounted, so switching tabs keeps an in-progress prescription. */}
      <Box className={classes.iframeContainer} display={reportWidget ? 'none' : undefined}>
        {renderedUrl && (
          <iframe
            id="scriptsure-iframe"
            name="scriptsure-iframe"
            title="ScriptSure e-Prescribing"
            src={renderedUrl}
            style={IFRAME_STYLE}
          />
        )}
      </Box>
      {reportWidget && (
        <Box className={classes.iframeContainer}>
          <ScriptSureReportFrame key={reportWidget} widget={reportWidget} />
        </Box>
      )}
    </Box>
  );
}

function ScriptSureReportFrame({ widget }: { readonly widget: ScriptSureReportWidget }): JSX.Element | null {
  const { getWidgetUrl } = useScriptSureWidgetUrl();
  const { selectedOrganization } = useScriptSurePractice();
  const colorScheme = useComputedColorScheme('light');
  const [url, setUrl] = useState<string>();
  const label = SCRIPTSURE_REPORT_WIDGETS.find((w) => w.widget === widget)?.label;

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
          showNotification({ color: 'red', title: 'Error', message: getErrorMessage(err), autoClose: false });
        }
      }
    };
    load().catch(console.error);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getWidgetUrl, widget, selectedOrganization]);

  if (!url) {
    return null;
  }
  return <iframe title={`ScriptSure ${label?.toLowerCase()}`} src={url} style={IFRAME_STYLE} />;
}
