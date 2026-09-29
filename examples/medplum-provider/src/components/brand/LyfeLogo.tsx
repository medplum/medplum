// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

// Mirrors the `LogoProps` contract of `@medplum/react`'s `Logo` so this is a
// drop-in replacement everywhere Medplum renders a logo.
export interface LyfeLogoProps {
  readonly size: number;
  readonly fill?: string;
}

/**
 * The Lyfe mark: a rounded tile carrying the wordmark's initial.
 *
 * Drawn as a single self-contained SVG rather than composed from layout
 * components. An earlier version used Mantine's `Center`, which the app's CSS
 * knocked down to `display: block` — the tile rendered but the letter fell to
 * the top-left corner. An SVG lays itself out from its own viewBox, so no
 * surrounding stylesheet can break it. The glyph is a path, not `<text>`, so it
 * is identical regardless of which font happens to be loaded.
 *
 * The tile colour is read from the Mantine theme, so it tracks `primaryColor`;
 * `fill` overrides it for surfaces that need a fixed colour, matching Medplum's
 * own `Logo`.
 * @param props - Component props.
 * @param props.size - Edge length of the square mark, in pixels.
 * @param props.fill - Overrides the themed tile colour.
 * @returns The logo element.
 */
export function LyfeLogo(props: LyfeLogoProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      style={{ width: props.size, height: props.size, display: 'block', flexShrink: 0 }}
      role="img"
      aria-label="Lyfe AI"
    >
      <rect width="24" height="24" rx="6" fill={props.fill ?? 'var(--mantine-primary-color-filled)'} />
      <path d="M8.2 5.8h2.7v8.4h5v2.7H8.2z" fill="var(--mantine-color-white)" />
    </svg>
  );
}
