// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, useComputedColorScheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useScriptSureIFrame } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { applyDarkmode } from '../../components/meds/applyDarkmode';
import classes from './EPrescribingPage.module.css';

export function ScriptSurePage(): JSX.Element {
  const iframeUrl = useScriptSureIFrame({
    onIframeSuccess: () =>
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully connected to ScriptSure',
        message: '',
      }),
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  // The bot returns a UI-agnostic URL; the app appends `darkmode=on|off` once
  // per iframe load (theme toggles mid-session intentionally do not reload
  // the iframe so any in-progress state is preserved — `colorScheme` is
  // deliberately omitted from the memo deps).
  const colorScheme = useComputedColorScheme('light');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderedUrl = useMemo(() => applyDarkmode(iframeUrl, colorScheme), [iframeUrl]);

  return (
    <Box className={classes.container}>
      <Box className={classes.iframeContainer}>
        {renderedUrl && (
          <iframe
            id="scriptsure-iframe"
            name="scriptsure-iframe"
            title="ScriptSure e-Prescribing"
            src={renderedUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </Box>
    </Box>
  );
}
