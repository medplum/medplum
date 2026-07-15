// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Modal, useComputedColorScheme } from '@mantine/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useMedicationRequestSyncPolling } from '../../hooks/useMedicationRequestSyncPolling';
import { applyDarkmode } from './applyDarkmode';

/** Stamped on MR when ScriptSure webhook confirms a prescription (see scriptsure-prescription-webhook-bot). */
const SCRIPTSURE_PRESCRIPTION_ID_SYSTEM = 'https://scriptsure.com/prescription-id';

export interface PrescriptionIFrameModalProps {
  opened: boolean;
  onClose: () => void;
  /** Initial URL; may be replaced when `onRefreshLaunchUrl` runs on open. */
  launchUrl: string | undefined;
  /** When set, called on open to refresh session token (idempotent bot call). */
  onRefreshLaunchUrl?: () => Promise<string | undefined>;
  title?: string;
  /**
   * MedicationRequest ids to poll until each transitions from “still in draft /
   * pending” to synced (non-draft or prescription-id present). Fires
   * {@link onFhirSynced} only once **all** of the ids that started unsynced have
   * synced. Skips auto-close if every MR was already synced when the modal opened
   * (e.g. reopening iframe). Pass a single-element array for the single-order path.
   */
  medicationRequestIdsToWatch?: string[];
  /** Invoked when polling detects the watched MR(s) were updated from the server (webhook merged). */
  onFhirSynced?: () => void;
}

function medicationRequestLooksSynced(mr: MedicationRequest): boolean {
  if (mr.status && mr.status !== 'draft') {
    return true;
  }
  return mr.identifier?.some((i) => i.system === SCRIPTSURE_PRESCRIPTION_ID_SYSTEM && Boolean(i.value)) ?? false;
}

/**
 * Modal embedding the ScriptSure (or vendor) prescription confirmation iframe.
 * Uses a ~9:16 viewport aspect ratio for the iframe area.
 *
 * @param props - Modal and iframe configuration.
 * @returns Mantine modal with embedded iframe.
 */
export function PrescriptionIFrameModal(props: PrescriptionIFrameModalProps): JSX.Element {
  const {
    opened,
    onClose,
    launchUrl,
    onRefreshLaunchUrl,
    title = 'Complete prescription',
    medicationRequestIdsToWatch,
    onFhirSynced,
  } = props;
  const resourcesToSync = medicationRequestIdsToWatch ?? [];

  // ScriptSure widget URLs are theme-agnostic from the bot side; the modal
  // appends `darkmode=on|off` based on the active Mantine color scheme right
  // before assigning to the iframe `src`. Resolved scheme is captured once
  // per open so toggling the theme mid-session does not force the iframe to
  // reload (which would discard any in-progress draft inside ScriptSure).
  const colorScheme = useComputedColorScheme('light');
  const [url, setUrl] = useState(() => applyDarkmode(launchUrl, colorScheme));

  const { timedOut, errors, allInitiallyUnsyncedSynced } = useMedicationRequestSyncPolling(resourcesToSync, {
    enabled: opened && resourcesToSync.length > 0 && Boolean(onFhirSynced),
    test: medicationRequestLooksSynced,
  });

  useEffect(() => {
    setUrl(applyDarkmode(launchUrl, colorScheme));
  }, [launchUrl, colorScheme]);

  useEffect(() => {
    if (allInitiallyUnsyncedSynced) {
      onFhirSynced?.();
    }
  }, [allInitiallyUnsyncedSynced, onFhirSynced]);

  // ScriptSure's embedded widget measures its viewport once during initial
  // paint and does not re-measure unless a `resize` event fires on its window.
  // When the modal is opening, Mantine's transform-based open animation is
  // still running during that first paint, so the widget can latch onto a
  // mid-animation size and render an empty body. Dispatching a `resize`
  // shortly after the animation completes nudges the widget to re-measure
  // and paint with the final container dimensions. Keep the delay > the
  // Mantine modal default transition (~200ms).
  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
    return (): void => {
      window.clearTimeout(id);
    };
  }, [opened]);

  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    let cancelled = false;

    const run = async (): Promise<void> => {
      if (onRefreshLaunchUrl) {
        try {
          const next = await onRefreshLaunchUrl();
          if (!cancelled && next) {
            setUrl(applyDarkmode(next, colorScheme));
          }
        } catch {
          if (!cancelled && launchUrl) {
            setUrl(applyDarkmode(launchUrl, colorScheme));
          }
        }
      } else if (launchUrl) {
        setUrl(applyDarkmode(launchUrl, colorScheme));
      }
    };

    run().catch(() => undefined);

    return (): void => {
      cancelled = true;
    };
  }, [opened, onRefreshLaunchUrl, launchUrl, colorScheme]);

  const hasReadErrors = errors.size > 0;

  return (
    <Modal opened={opened} onClose={onClose} size="xl" centered title={title} styles={{ body: { padding: 0 } }}>
      <Box p="md" style={{ maxWidth: 'min(100%, 560px)', margin: '0 auto' }}>
        {timedOut && (
          <Alert
            mb="sm"
            color="yellow"
            variant="light"
            icon={<IconAlertCircle size={16} />}
            title="Confirmation pending"
          >
            We have not received a confirmation from the e-prescribing system yet
            {hasReadErrors ? ' (some medication reads failed while waiting)' : ''}. You can leave this dialog open and
            refresh the medications list shortly, or close it and check back later.
          </Alert>
        )}
        <Box
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '9 / 16',
            maxHeight: 'min(80vh, 720px)',
          }}
        >
          {url ? (
            <iframe
              title={title}
              src={url}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 8,
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation"
            />
          ) : null}
        </Box>
      </Box>
    </Modal>
  );
}
