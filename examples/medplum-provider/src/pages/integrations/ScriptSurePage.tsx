// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useScriptSureIFrame } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
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

  return (
    <Box className={classes.container}>
      <Box className={classes.iframeContainer}>
        {iframeUrl && (
          <iframe
            id="scriptsure-iframe"
            name="scriptsure-iframe"
            title="ScriptSure e-Prescribing"
            src={iframeUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </Box>
    </Box>
  );
}
