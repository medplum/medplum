// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Divider, Text } from '@mantine/core';
import { isAuxClick } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import classes from './BillingNavLink.module.css';

export interface BillingNavLinkProps {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly onNavigate: () => void;
  readonly icon?: ReactNode;
  /** A Mantine color for a status dot in place of an icon. */
  readonly dotColor?: string;
  readonly count?: number;
  /** Set when the link is a tab of a tablist rather than a page link. */
  readonly tabProps?: { id: string; controls: string };
}

/**
 * A link in a billing sidebar, styled like the app navbar links. Plain clicks call `onNavigate`; modified and
 * middle clicks follow `href`, so the link can still open in a new tab.
 * @param props - The BillingNavLink React props.
 * @returns The BillingNavLink React node.
 */
export function BillingNavLink(props: BillingNavLinkProps): JSX.Element {
  const { href, label, active, onNavigate, icon, dotColor, count, tabProps } = props;
  return (
    <Anchor
      href={href}
      className={classes.link}
      data-active={active || undefined}
      {...(tabProps
        ? { role: 'tab', id: tabProps.id, 'aria-controls': tabProps.controls, 'aria-selected': active }
        : { 'aria-current': active ? 'page' : undefined })}
      onClick={(e) => {
        if (!isAuxClick(e)) {
          e.preventDefault();
          onNavigate();
        }
      }}
    >
      {icon}
      {dotColor && <span className={classes.dot} style={{ backgroundColor: `var(--mantine-color-${dotColor}-6)` }} />}
      <span className={classes.label}>{label}</span>
      {count !== undefined && <span className={classes.count}>{count.toLocaleString()}</span>}
    </Anchor>
  );
}

/**
 * A group heading between billing sidebar links.
 * @param props - The heading text.
 * @param props.children - The heading text.
 * @returns The heading.
 */
export function BillingNavGroup(props: { readonly children: ReactNode }): JSX.Element {
  return <Text className={classes.group}>{props.children}</Text>;
}

/**
 * A divider between groups of sidebar links, styled like the app navbar's.
 * @returns The divider.
 */
export function BillingNavDivider(): JSX.Element {
  return <Divider mt="xs" className={classes.divider} />;
}
