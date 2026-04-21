// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Modal } from '@mantine/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

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
   * When set, polls Medplum for this MedicationRequest until it transitions from
   * “still in draft / pending” to synced (non-draft or prescription-id present).
   * Skips auto-close if the MR was already synced when the modal opened (e.g. reopening iframe).
   */
  medicationRequestIdToWatch?: string;
  /** Invoked when polling detects the MR was updated from the server (webhook merged). */
  onFhirSynced?: () => void;
}

const POLL_MS = 3500;

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
    medicationRequestIdToWatch,
    onFhirSynced,
  } = props;
  const medplum = useMedplum();
  const [url, setUrl] = useState(launchUrl);
  /** null = not sampled yet; true = first sample was still draft/pending; false = first sample already synced (never auto-close). */
  const pollStartedUnsyncedRef = useRef<boolean | null>(null);
  const skipPollRef = useRef(false);

  useEffect(() => {
    setUrl(launchUrl);
  }, [launchUrl]);

  useEffect(() => {
    pollStartedUnsyncedRef.current = null;
    skipPollRef.current = false;
  }, [opened, medicationRequestIdToWatch]);

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
            setUrl(next);
          }
        } catch {
          if (!cancelled && launchUrl) {
            setUrl(launchUrl);
          }
        }
      } else if (launchUrl) {
        setUrl(launchUrl);
      }
    };

    run().catch(() => undefined);

    return (): void => {
      cancelled = true;
    };
  }, [opened, onRefreshLaunchUrl, launchUrl]);

  useEffect(() => {
    if (!opened || !medicationRequestIdToWatch || !onFhirSynced) {
      return undefined;
    }
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        if (skipPollRef.current) {
          return;
        }
        const mr = await medplum.readResource('MedicationRequest', medicationRequestIdToWatch);
        if (cancelled) {
          return;
        }
        const syncedNow = medicationRequestLooksSynced(mr);
        if (pollStartedUnsyncedRef.current === null) {
          pollStartedUnsyncedRef.current = !syncedNow;
          if (!pollStartedUnsyncedRef.current) {
            skipPollRef.current = true;
          }
          return;
        }
        if (syncedNow) {
          onFhirSynced();
        }
      } catch {
        // Keep polling until close
      }
    };

    const intervalId = window.setInterval(() => {
      tick().catch(() => undefined);
    }, POLL_MS);
    tick().catch(() => undefined);

    return (): void => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [opened, medicationRequestIdToWatch, medplum, onFhirSynced]);

  return (
    <Modal opened={opened} onClose={onClose} size="xl" centered title={title} styles={{ body: { padding: 0 } }}>
      <Box p="md" style={{ maxWidth: 'min(100%, 560px)', margin: '0 auto' }}>
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
