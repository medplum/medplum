// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Divider, Text } from '@mantine/core';
import { isAuxClick } from '@medplum/react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import classes from './BillingNavLink.module.css';

/** A Mantine color (shade 6 unless given, as in `gray.4`), or two that the dot fades between. */
export type DotColor = string | readonly [string, string];

export interface BillingNavLinkProps {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly onNavigate: () => void;
  readonly icon?: ReactNode;
  /** A status dot in place of an icon. */
  readonly dotColor?: DotColor;
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
      {dotColor && (
        <span
          className={typeof dotColor === 'string' ? classes.dot : `${classes.dot} ${classes.dotCycling}`}
          style={getDotStyle(dotColor)}
        />
      )}
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

function getDotStyle(color: DotColor): CSSProperties {
  if (typeof color === 'string') {
    return { backgroundColor: toCssColor(color) };
  }
  return Object.fromEntries(color.map((c, i) => [`--dot-color-${i}`, toCssColor(c)]));
}

function toCssColor(color: string): string {
  const [name, shade = '6'] = color.split('.');
  return `var(--mantine-color-${name}-${shade})`;
}
