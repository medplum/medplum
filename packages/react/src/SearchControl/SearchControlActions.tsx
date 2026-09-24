// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Menu, Text, Tooltip } from '@mantine/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { isAuxClick } from '../utils/dom';
import classes from './SearchControl.module.css';

interface SearchControlActionBase {
  /** Stable React key. */
  readonly key: string;
  /** Menu text, or tooltip + aria-label for toolbar icons. */
  readonly label: string;
  /** Icon element, e.g. `<IconRefresh size={16} />` (use size 16 to match the built-in actions). */
  readonly icon?: ReactNode;
  /** Disables the action until at least one row is checked. */
  readonly requiresSelection?: boolean;
  readonly disabled?: boolean;
  /** Mantine color: the fill for a 'filled' toolbar action, or the text + icon color for a menu item. */
  readonly color?: string;
}

/**
 * A custom {@link SearchControl} action. It either runs `onClick` with the checked row IDs or links
 * to `href` - never both, which is a compile error. A link navigates in-app on a plain click and
 * opens a new tab on Cmd/Ctrl-click or middle-click.
 */
export type SearchControlAction = SearchControlActionBase &
  (
    | { readonly onClick: (selectedIds: string[]) => void; readonly href?: never }
    | { readonly href: string; readonly onClick?: never }
  );

/** A custom item in the SearchControl "…" actions menu. */
export type SearchControlMenuAction = SearchControlAction;

/**
 * A custom action button rendered in the right-anchored toolbar cluster, styled to match the
 * built-in actions button and New "+" button. Use it to add or replace right-side actions - e.g. a
 * "Sync" button when embedding {@link SearchControl} in a medications view.
 */
export type SearchControlToolbarAction = SearchControlAction & {
  readonly icon: ReactNode;
  /** 'outline' (default) is a transparent bordered gray button; 'filled' is solid like the New "+". */
  readonly variant?: 'outline' | 'filled';
};

interface ActionRenderProps<T extends SearchControlAction> {
  readonly action: T;
  readonly selectedIds: string[];
}

/**
 * Returns the click handler and link props shared by menu items and toolbar buttons. A disabled
 * link renders as a plain disabled control, so it has no href to follow.
 * @param action - The action.
 * @param selectedIds - The checked row IDs.
 * @returns Whether the action is disabled, its href (omitted while disabled), and its click handler.
 */
function useActionHandlers(
  action: SearchControlAction,
  selectedIds: string[]
): { disabled: boolean; href: string | undefined; onClick: (e: MouseEvent) => void } {
  const navigate = useMedplumNavigate();
  const disabled = !!action.disabled || (!!action.requiresSelection && selectedIds.length === 0);
  const href = disabled ? undefined : action.href;
  const onClick = (e: MouseEvent): void => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (action.href !== undefined) {
      // Cmd/Ctrl/Shift-click keep the browser's link behavior (new tab/window).
      if (isAuxClick(e) || e.shiftKey) {
        return;
      }
      e.preventDefault();
      navigate(action.href);
      return;
    }
    action.onClick(selectedIds);
  };
  return { disabled, href, onClick };
}

/**
 * Renders a custom item in the "…" actions menu.
 * @param props - The action and the checked row IDs.
 * @returns The menu item.
 */
export function SearchControlMenuActionItem(props: ActionRenderProps<SearchControlMenuAction>): JSX.Element {
  const { action } = props;
  const { disabled, href, onClick } = useActionHandlers(action, props.selectedIds);
  // Icons are dimmed like the built-in items unless the item has its own color.
  const leftSection = action.icon && (
    <span
      className={classes.menuActionIcon}
      style={action.color ? undefined : { color: 'var(--mantine-color-dimmed)' }}
    >
      {action.icon}
    </span>
  );
  const content = <Text size="sm">{action.label}</Text>;
  if (href) {
    return (
      <Menu.Item component="a" href={href} color={action.color} leftSection={leftSection} onClick={onClick}>
        {content}
      </Menu.Item>
    );
  }
  return (
    <Menu.Item color={action.color} leftSection={leftSection} disabled={disabled} onClick={onClick}>
      {content}
    </Menu.Item>
  );
}

/**
 * Renders a custom toolbar action button.
 * @param props - The action and the checked row IDs.
 * @returns The toolbar button with its tooltip.
 */
export function SearchControlToolbarActionButton(props: ActionRenderProps<SearchControlToolbarAction>): JSX.Element {
  const { action } = props;
  const { disabled, href, onClick } = useActionHandlers(action, props.selectedIds);
  const filled = action.variant === 'filled';
  const buttonProps = {
    className: filled ? undefined : classes.actionIcon,
    variant: filled ? 'filled' : 'transparent',
    color: filled ? (action.color ?? 'blue') : 'gray',
    size: 32,
    radius: 'xl',
    'aria-label': action.label,
    onClick,
  } as const;
  return (
    <Tooltip label={action.label} position="bottom" openDelay={500}>
      {href ? (
        <ActionIcon component="a" href={href} {...buttonProps}>
          {action.icon}
        </ActionIcon>
      ) : (
        <ActionIcon disabled={disabled} {...buttonProps}>
          {action.icon}
        </ActionIcon>
      )}
    </Tooltip>
  );
}
