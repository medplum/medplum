// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Resolved Mantine color scheme used by ScriptSure iframe URLs.
 *
 * ScriptSure widget URLs accept `?darkmode=on|off` to switch their visual
 * theme. The bot/client layer is intentionally UI-agnostic and never appends
 * this param; the consuming app layer resolves the active color scheme and
 * mutates the URL right before assigning it to an iframe `src`.
 */
export type DarkmodeScheme = 'light' | 'dark';

/**
 * Appends or overrides the ScriptSure `darkmode` query parameter on a
 * vendor-supplied iframe URL based on the active Mantine color scheme.
 *
 * Returns the input untouched (and never throws) when the URL is undefined,
 * not a string, or not parseable as a URL — keeping render paths simple.
 *
 * @param url - The vendor-returned iframe URL (typically from a bot response).
 * @param scheme - Resolved color scheme; `'dark'` maps to `darkmode=on`, anything else to `off`.
 * @returns A URL with `darkmode=on|off` set, or the original input when it cannot be parsed.
 */
export function applyDarkmode(url: string | undefined, scheme: DarkmodeScheme): string | undefined {
  if (typeof url !== 'string' || url.length === 0) {
    return url;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.searchParams.set('darkmode', scheme === 'dark' ? 'on' : 'off');
  return parsed.toString();
}
