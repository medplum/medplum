// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, screen } from './render';

/** Debounce delay used by AsyncAutocomplete (100ms) plus buffer for promise resolution. */
const AUTOCOMPLETE_DEBOUNCE_MS = 1000;

/**
 * Types into an autocomplete input and advances fake timers until async search results resolve.
 * @param input - The autocomplete input element.
 * @param text - The search text to type.
 */
export async function typeInAutocomplete(input: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
  });
}

/**
 * Clicks an autocomplete dropdown option after waiting for it to appear.
 * @param text - The option label text or regular expression to match.
 */
export async function clickAutocompleteOption(text: string | RegExp): Promise<void> {
  const option = await screen.findByText(text);
  await act(async () => {
    fireEvent.click(option);
  });
}
