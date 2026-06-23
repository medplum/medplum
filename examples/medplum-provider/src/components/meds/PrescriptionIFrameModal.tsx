// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Modal, useComputedColorScheme } from '@mantine/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
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
   * When set, polls Medplum for this MedicationRequest until it transitions from
   * “still in draft / pending” to synced (non-draft or prescription-id present).
   * Skips auto-close if the MR was already synced when the modal opened (e.g. reopening iframe).
   */
  medicationRequestIdToWatch?: string;
  /** Invoked when polling detects the MR was updated from the server (webhook merged). */
  onFhirSynced?: () => void;
}

const POLL_MS = 3500;
/** Max poll attempts before giving up (~3.5 minutes at POLL_MS). */
const POLL_MAX_ATTEMPTS = 60;

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
  // ScriptSure widget URLs are theme-agnostic from the bot side; the modal
  // appends `darkmode=on|off` based on the active Mantine color scheme right
  // before assigning to the iframe `src`. Resolved scheme is captured once
  // per open so toggling the theme mid-session does not force the iframe to
  // reload (which would discard any in-progress draft inside ScriptSure).
  const colorScheme = useComputedColorScheme('light');
  const [url, setUrl] = useState(() => applyDarkmode(launchUrl, colorScheme));
  const [pollTimedOut, setPollTimedOut] = useState(false);
  /** null = not sampled yet; true = first sample was still draft/pending; false = first sample already synced (never auto-close). */
  const pollStartedUnsyncedRef = useRef<boolean | null>(null);
  const skipPollRef = useRef(false);

  useEffect(() => {
    setUrl(applyDarkmode(launchUrl, colorScheme));
  }, [launchUrl, colorScheme]);

  useEffect(() => {
    pollStartedUnsyncedRef.current = null;
    skipPollRef.current = false;
    setPollTimedOut(false);
  }, [opened, medicationRequestIdToWatch]);

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

  useEffect(() => {
    if (!opened || !medicationRequestIdToWatch || !onFhirSynced) {
      return undefined;
    }
    let cancelled = false;
    let intervalId: number | undefined;
    let attempts = 0;

    const stop = (): void => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async (): Promise<void> => {
      try {
        if (skipPollRef.current) {
          return;
        }
        // The poll exists to observe a webhook-driven update, so a cached
        // read would defeat the purpose: bypass MedplumClient's request
        // cache here.
        const mr = await medplum.readResource('MedicationRequest', medicationRequestIdToWatch, { cache: 'reload' });
        if (cancelled) {
          return;
        }
        const syncedNow = medicationRequestLooksSynced(mr);
        if (pollStartedUnsyncedRef.current === null) {
          pollStartedUnsyncedRef.current = !syncedNow;
          if (!pollStartedUnsyncedRef.current) {
            skipPollRef.current = true;
            stop();
          }
          return;
        }
        if (syncedNow) {
          stop();
          onFhirSynced();
        }
      } catch {
        // Transient read failures are not counted against POLL_MAX_ATTEMPTS so a brief
        // network blip does not cause a false timeout; the attempt counter only ticks on
        // successful reads where sync was still pending.
      }
    };

    intervalId = window.setInterval(() => {
      attempts += 1;
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stop();
        if (!cancelled && pollStartedUnsyncedRef.current === true) {
          setPollTimedOut(true);
        }
        return;
      }
      tick().catch(() => undefined);
    }, POLL_MS);
    tick().catch(() => undefined);

    return (): void => {
      cancelled = true;
      stop();
    };
  }, [opened, medicationRequestIdToWatch, medplum, onFhirSynced]);

  return (
    <Modal opened={opened} onClose={onClose} size="xl" centered title={title} styles={{ body: { padding: 0 } }}>
      <Box p="md" style={{ maxWidth: 'min(100%, 560px)', margin: '0 auto' }}>
        {pollTimedOut && (
          <Alert
            mb="sm"
            color="yellow"
            variant="light"
            icon={<IconAlertCircle size={16} />}
            title="Confirmation pending"
          >
            We have not received a confirmation from the e-prescribing system yet. You can leave this dialog open and
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
