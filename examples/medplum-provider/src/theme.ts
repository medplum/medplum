// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColorsTuple } from '@mantine/core';
import { createTheme } from '@mantine/core';

// Mantine colour tuples are ten shades running light to dark, which maps one to
// one onto the Tailwind scale the Lyfe platform is built from. Each entry below
// is the Tailwind value at the same position, so the palettes stay identical
// without either side having to translate.

// Lyfe's accent, Tailwind `blue`. Shade 6 (#2563eb) is what the platform uses
// for the active nav item and the logo tile.
const primary: MantineColorsTuple = [
  '#eff6ff',
  '#dbeafe',
  '#bfdbfe',
  '#93c5fd',
  '#60a5fa',
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#1e40af',
  '#1e3a8a',
];

// Lyfe's neutral, Tailwind `slate` — a cooler grey than Mantine's default.
// Overriding `gray` rather than registering a new colour is deliberate: the
// Medplum AppShell expresses every border, muted label, hover state and the
// main content background in terms of `--mantine-color-gray-*`, so this single
// override re-tints the whole shell without touching a component.
const gray: MantineColorsTuple = [
  '#f8fafc',
  '#f1f5f9',
  '#e2e8f0',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  '#475569',
  '#334155',
  '#1e293b',
  '#0f172a',
];

export const lyfeTheme = createTheme({
  colors: { primary, gray },
  primaryColor: 'primary',
  primaryShade: 6,

  // Carried over unchanged from the stock Medplum provider theme — these set the
  // app's type scale and are unrelated to branding.
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: '500',
        lineHeight: '2.0',
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
});
