// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import type { GoogleCredentialResponse } from '@medplum/core';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createScriptTag } from '../utils/script';

interface GoogleApi {
  readonly accounts: {
    id: {
      initialize: (args: any) => void;
      renderButton: (parent: HTMLElement, args: any) => void;
    };
  };
}

declare const google: GoogleApi;

export interface GoogleButtonProps {
  readonly googleClientId?: string;
  readonly handleGoogleCredential: (response: GoogleCredentialResponse) => void;
}

export function GoogleButton(props: GoogleButtonProps): JSX.Element | null {
  const { googleClientId, handleGoogleCredential } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(typeof google !== 'undefined');
  const initializedRef = useRef(false);
  const buttonRenderedRef = useRef(false);

  useEffect(() => {
    if (typeof google === 'undefined') {
      createScriptTag('https://accounts.google.com/gsi/client', () => setScriptLoaded(true));
      return;
    }

    if (!initializedRef.current) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });
      initializedRef.current = true;
    }

    if (parentRef.current && !buttonRenderedRef.current) {
      google.accounts.id.renderButton(parentRef.current, {
        type: 'standard',
        logo_alignment: 'center',
        width: parentRef.current.clientWidth,
      });
      buttonRenderedRef.current = true;
    }
  }, [googleClientId, scriptLoaded, handleGoogleCredential]);

  if (!googleClientId) {
    return null;
  }

  return <Box ref={parentRef} w="100%" h={40} display="flex" style={{ justifyContent: 'center' }} />;
}
