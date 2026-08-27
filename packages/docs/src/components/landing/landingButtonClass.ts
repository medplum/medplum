// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import clsx from 'clsx';
import styles from './LandingButton.module.css';

export type LandingButtonVariant = 'purple' | 'white';

export interface LandingButtonOptions {
  /**
   * Renders the hover treatment without the pointer, for a control that is engaged
   * (e.g. a dropdown trigger whose menu is open).
   */
  readonly active?: boolean;
}

/**
 * The class list for a marketing CTA button.
 *
 * Prefer the `LandingButton` component; reach for this when the caller renders its own
 * element, as `BuildDropdown` does with the `<button>` trigger it owns.
 *
 * @param variant - Primary (purple) or secondary (white) treatment.
 * @param options - State opt-ins.
 * @returns The className to apply.
 */
export function landingButtonClass(variant: LandingButtonVariant, options?: LandingButtonOptions): string {
  return clsx(styles.button, styles[variant], options?.active && styles[`${variant}Active`]);
}
