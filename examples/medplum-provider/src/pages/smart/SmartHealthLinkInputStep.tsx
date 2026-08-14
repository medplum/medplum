// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Center, Divider, Input, Loader, Stack, Textarea } from '@mantine/core';
import { QrCodeScanner } from '@medplum/react';
import { IconEye, IconQrcode } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './SmartHealthLinkImport.module.css';

export interface SmartHealthLinkInputStepProps {
  readonly shlink: string;
  readonly onShlinkChange: (value: string) => void;
  readonly error: string | undefined;
  readonly busy: boolean;
  readonly scanning: boolean;
  readonly scanSessionKey: number;
  readonly onStartScan: () => void;
  readonly onCancelScan: () => void;
  readonly onScan: (data: string) => void;
  readonly onResolve: () => void;
}

/**
 * Step 1: accept a SMART Health Link by paste or by scanning a QR code.
 * @param props - The SmartHealthLinkInputStep React props.
 * @returns The SmartHealthLinkInputStep React node.
 */
export function SmartHealthLinkInputStep(props: SmartHealthLinkInputStepProps): JSX.Element {
  const {
    shlink,
    onShlinkChange,
    error,
    busy,
    scanning,
    scanSessionKey,
    onStartScan,
    onCancelScan,
    onScan,
    onResolve,
  } = props;

  if (scanning) {
    return (
      <Stack gap="md">
        <Stack gap={8}>
          <Input.Label>Scan SMART Health Card</Input.Label>
          <div className={classes.scanner}>
            <QrCodeScanner key={scanSessionKey} onScan={onScan} />
            {busy && (
              <div className={classes.scannerOverlay} aria-hidden>
                <Center h="100%">
                  <Loader size="sm" color="gray.3" />
                </Center>
              </div>
            )}
          </div>
        </Stack>
        {error && <Input.Error>{error}</Input.Error>}
        <Button fullWidth variant="default" onClick={onCancelScan}>
          Cancel
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap="md">
        <Stack gap={8}>
          <Input.Label>SMART Health Link</Input.Label>
          <Textarea
            placeholder="shlink:/..."
            value={shlink}
            onChange={(event) => onShlinkChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              // A link is a single token, so Enter opens it rather than adding a newline.
              // Shift+Enter still inserts one, and we ignore Enter mid-IME-composition.
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              if (!busy) {
                onResolve();
              }
            }}
            minRows={4}
            autosize
            aria-label="SMART Health Link"
            error={error}
          />
        </Stack>
        <Button fullWidth leftSection={<IconEye size={16} />} loading={busy} onClick={onResolve}>
          Open SMART Health Link
        </Button>
      </Stack>
      <Divider label="or" labelPosition="center" />
      <Button fullWidth variant="default" leftSection={<IconQrcode size={16} />} onClick={onStartScan}>
        Scan SMART Health Card
      </Button>
    </Stack>
  );
}
