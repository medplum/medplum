// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, List, Text } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useMissingDependencies } from '../hooks/useMissingDependencies';

const DISMISSED_KEY_PREFIX = 'medplum-provider-missing-dependencies-dismissed:';

// sessionStorage access can throw (blocked cookies, sandboxed iframe), so both read and write are
// guarded — an unavailable store just means dismissal falls back to component state for the session.
function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    sessionStorage.setItem(key, 'true');
  } catch {
    // Ignore storage failures; dismissal falls back to component state.
  }
}

/**
 * A single consolidated banner shown after sign-in when one or more of the app's expected Medplum
 * shared projects (UMLS terminology, US Core profiles) are not linked into the
 * user's project. Fields that depend on them show their own local "Not found" errors; this banner
 * explains the shared root cause and links to setup docs. Dismissible for the session.
 *
 * See https://github.com/medplum/medplum/issues/9824.
 * @returns The banner, or null when nothing is missing / it has been dismissed.
 */
export function MissingDependenciesBanner(): JSX.Element | null {
  const medplum = useMedplum();
  const sessionKey = medplum.getProject()?.id ?? medplum.getProfile()?.id ?? 'default';
  const { missingGroups, loading } = useMissingDependencies();
  const dismissedKey = DISMISSED_KEY_PREFIX + sessionKey;
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissedKey));

  if (loading || dismissed || missingGroups.length === 0) {
    return null;
  }

  const handleClose = (): void => {
    writeDismissed(dismissedKey);
    setDismissed(true);
  };

  return (
    <Alert
      icon={<IconAlertTriangle size={16} />}
      title="Some Medplum shared projects are not linked"
      color="yellow"
      withCloseButton
      closeButtonLabel="Dismiss"
      onClose={handleClose}
      m="md"
    >
      <Text size="sm" mb="xs">
        The following shared projects are missing from your project. Fields that depend on them will show &ldquo;Not
        found&rdquo; errors. Link them from the Medplum admin console, or contact your system administrator.
      </Text>
      <List size="sm">
        {missingGroups.map((group) => (
          <List.Item key={group.id}>
            <Anchor href={group.docsUrl} target="_blank" rel="noopener noreferrer">
              {group.name}
            </Anchor>
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}
