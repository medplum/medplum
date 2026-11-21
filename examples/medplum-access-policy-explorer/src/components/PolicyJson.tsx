// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, CopyButton, Group, JsonInput, Stack } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { IconCheck, IconCode, IconCopy, IconRestore } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { PolicyRowState } from '../lib/rows';

function stringify(policy: AccessPolicy): string {
  return JSON.stringify(policy, null, 2);
}

export function PolicyJson({
  row,
  onChange,
}: {
  readonly row: PolicyRowState;
  readonly onChange: (row: PolicyRowState) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const current = stringify(row.policy);
  const dirty = open && draft !== current;

  function toggle(): void {
    if (!open) {
      setDraft(current);
      setError(undefined);
    }
    setOpen(!open);
  }

  function apply(): void {
    try {
      const policy = JSON.parse(draft) as AccessPolicy;
      if (policy.resourceType !== 'AccessPolicy') {
        throw new Error('JSON must be an AccessPolicy resource');
      }
      onChange({ ...row, policy, label: policy.name ?? row.label, original: row.original ?? row.policy });
      setDraft(stringify(policy));
      setError(undefined);
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }

  function revert(): void {
    if (row.original) {
      onChange({ ...row, policy: row.original, label: row.original.name ?? row.label, original: undefined });
      setDraft(stringify(row.original));
      setError(undefined);
    }
  }

  return (
    <Stack gap={4} mt={4}>
      <Group gap={4}>
        <Button size="compact-xs" variant="subtle" leftSection={<IconCode size={12} />} onClick={toggle}>
          {open ? 'Hide JSON' : 'Show JSON'}
        </Button>
        {row.original && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="orange"
            leftSection={<IconRestore size={12} />}
            onClick={revert}
          >
            Revert edits
          </Button>
        )}
      </Group>
      {open && (
        <Stack gap={4}>
          <JsonInput
            aria-label={`${row.label} JSON`}
            value={draft}
            onChange={setDraft}
            autosize
            minRows={4}
            maxRows={30}
            formatOnBlur
            validationError="Invalid JSON"
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
          />
          {error && (
            <Alert color="red" p="xs">
              {error}
            </Alert>
          )}
          <Group gap={4}>
            <Button size="compact-xs" disabled={!dirty} onClick={apply}>
              Apply edits
            </Button>
            <Button size="compact-xs" variant="default" disabled={!dirty} onClick={() => setDraft(current)}>
              Discard
            </Button>
            <CopyButton value={draft}>
              {({ copied, copy }) => (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  onClick={copy}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
