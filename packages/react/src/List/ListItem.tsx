// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference, Resource } from '@medplum/fhirtypes';
import cx from 'clsx';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import classes from './List.module.css';

export interface ListItemProps {
  /**
   * Navigation target. When provided, the item renders as a `MedplumLink`.
   * Mutually exclusive with `onClick` (if both are supplied, `to` wins and
   * `onClick` is forwarded to the underlying link).
   */
  readonly to?: Resource | Reference | string;
  /** Click handler. When no `to` is provided, the item renders as a `<button>`. */
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly selected?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Selectable list row. Renders as a navigation link when `to` is supplied, or
 * as a native `<button>` when `onClick` is supplied. The
 * shared `.item`/`.selected` styles produce a consistent hover and selected
 * state across all list-based screens.
 * @param props - Item content and behavior (to, onClick, selected, className, children).
 * @returns The link or button-row element.
 */
export function ListItem(props: ListItemProps): JSX.Element {
  const { to, onClick, selected, className, children } = props;
  const itemClass = cx(classes.item, selected && classes.selected, className);

  if (to) {
    return (
      <MedplumLink to={to} underline="never" className={itemClass} onClick={onClick}>
        {children}
      </MedplumLink>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={itemClass}>
        {children}
      </button>
    );
  }

  return <div className={itemClass}>{children}</div>;
}
