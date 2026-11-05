// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Location, Reference } from '@medplum/fhirtypes';

export interface ServiceFacilitiesConfirmation {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
}

const listAll = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * What to ask before a save that moves a visit type or provider between every service facility and a list of
 * them. Linked service facilities count as listed, so a provider with one never crosses.
 * @param name - The visit type's or provider's name.
 * @param stored - Every service facility it is at as stored.
 * @param draft - Every service facility it will be at once saved.
 * @returns The question, or undefined when the save doesn't cross.
 */
export function getServiceFacilitiesConfirmation(
  name: string,
  stored: readonly Reference<Location>[],
  draft: readonly Reference<Location>[]
): ServiceFacilitiesConfirmation | undefined {
  if (stored.length > 0 && draft.length === 0) {
    return {
      title: `Offer ${name} at every service facility?`,
      body: `No service facilities are listed, so after this save ${name} is offered at every one of them.`,
      confirmLabel: 'Offer everywhere',
    };
  }
  if (stored.length === 0 && draft.length > 0) {
    const names = draft.map((facility) => facility.display ?? 'an unnamed service facility');
    const places = names.length === 1 ? names[0] : `${names.length} service facilities`;
    return {
      title: `Offer ${name} only at ${places}?`,
      body: `${name} is offered at every service facility now. After this save, only at ${listAll.format(names)}.`,
      confirmLabel: `Limit to ${places}`,
    };
  }
  return undefined;
}
