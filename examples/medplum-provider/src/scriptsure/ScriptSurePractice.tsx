// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select } from '@mantine/core';
import { useScriptSurePractice } from '@medplum/scriptsure-react';
import type { JSX } from 'react';

// The affiliation-scoped practice context + hook are vendor-neutral and live in
// `@medplum/scriptsure-react` so any consumer gets the same discovery/selection
// behavior. Re-exported here for existing imports; this file only owns the
// Mantine-specific switcher UI.
export { ScriptSurePracticeProvider, useScriptSurePractice } from '@medplum/scriptsure-react';
export type { ScriptSurePracticeContextValue } from '@medplum/scriptsure-react';

/**
 * Compact practice-location switcher for the app shell. Renders nothing when the
 * prescriber has fewer than two ScriptSure practices (single-practice projects
 * need no picker; the backend resolves the practice automatically).
 *
 * @returns The switcher element, or null.
 */
export function ScriptSurePracticeSwitcher(): JSX.Element | null {
  const { practices, selectedOrganizationId, setSelectedOrganizationId } = useScriptSurePractice();
  if (practices.length < 2) {
    return null;
  }
  return (
    <Select
      aria-label="ScriptSure practice location"
      placeholder="Select location"
      size="xs"
      w={220}
      data={practices.map((o) => ({
        value: o.id as string,
        label: o.name ?? `Practice ${o.id}`,
      }))}
      value={selectedOrganizationId ?? null}
      onChange={(v) => setSelectedOrganizationId(v ?? undefined)}
    />
  );
}
