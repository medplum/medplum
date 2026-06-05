// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, screen } from './render';

/** Debounce delay used by AsyncAutocomplete (100ms) plus buffer for promise resolution. */
const AUTOCOMPLETE_DEBOUNCE_MS = 1000;

/**
 * Types into an autocomplete input and advances fake timers until async search results resolve.
 */
export async function typeInAutocomplete(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
  });
}

/**
 * Clicks an autocomplete dropdown option after waiting for it to appear.
 */
export async function clickAutocompleteOption(text: string | RegExp): Promise<void> {
  const option = await screen.findByText(text);
  await act(async () => {
    fireEvent.click(option);
  });
}

/**
 * Types a search string, optionally waits for a dropdown option, then selects with ArrowDown + Enter.
 * Omit optionText for creatable inputs or when the option label is not known ahead of time.
 */
export async function selectAutocompleteOption(
  input: HTMLInputElement,
  searchText: string,
  optionText?: string | RegExp,
  downCount = 1
): Promise<void> {
  await typeInAutocomplete(input, searchText);

  if (optionText !== undefined) {
    await screen.findByText(optionText);
  }

  await act(async () => {
    for (let i = 0; i < downCount; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    }
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });
}
