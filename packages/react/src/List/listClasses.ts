// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import classes from './List.module.css';

/**
 * CSS module class names exposed for use by consumers that want to style
 * adjacent elements consistently with `ListShell` and `ListItem`.
 */
export const listClasses = {
  /** Pill-style Tabs for list headers. Apply to `<Tabs className={listClasses.pillTabs}>`. */
  pillTabs: classes.pillTabs,
  /** Right-side border for panels that sit next to a `ListShell`. */
  detailBorder: classes.detailBorder,
  /**
   * Text style for a `ListShell` header that shows a plain title (no pill
   * tabs). Matches the pill-tab text style (14px / weight 450) so plain-text
   * headers and pill-tab headers feel optically consistent across screens.
   */
  headerText: classes.headerText,
};
