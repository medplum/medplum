// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, useComputedColorScheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useScriptSureIFrame } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { applyDarkmode } from '../../components/meds/applyDarkmode';

export function ScriptSureTab(): JSX.Element {
  const { patientId } = useParams();
  const syncedRef = useRef(false);
  const iframeLoadedRef = useRef(false);

  const checkAndNotify = (): void => {
    if (syncedRef.current && iframeLoadedRef.current) {
      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully connected to ScriptSure',
        message: 'Patient information synced',
      });
    }
  };

  const iframeUrl = useScriptSureIFrame({
    patientId,
    onPatientSyncSuccess: () => {
      syncedRef.current = true;
      checkAndNotify();
    },
    onIframeSuccess: () => {
      iframeLoadedRef.current = true;
      checkAndNotify();
    },
    onError: (err) => showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) }),
  });

  // The bot returns a UI-agnostic URL; the app appends `darkmode=on|off` once
  // per iframe load so toggling the Mantine color scheme does not force the
  // chart iframe to reload (and lose any in-progress state).
  const colorScheme = useComputedColorScheme('light');
  const [renderedUrl, setRenderedUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    setRenderedUrl(applyDarkmode(iframeUrl, colorScheme));
    // Intentionally not depending on `colorScheme` so the iframe is not
    // reloaded mid-session when the user toggles the theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeUrl]);

  return (
    <Box style={{ flex: 1, minHeight: 0 }}>
      {renderedUrl && (
        <iframe
          id="scriptsure-iframe"
          name="scriptsure-iframe"
          title="ScriptSure e-Prescribing"
          src={renderedUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
        ></iframe>
      )}
    </Box>
  );
}
