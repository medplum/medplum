// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import type { Reference } from '@medplum/fhirtypes';
import { useMedplumNavigate } from '@medplum/react-hooks';
import { IconCornerDownRight, IconExternalLink, IconLink } from '@tabler/icons-react';
import type { MouseEvent, ReactNode } from 'react';
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import classes from './SearchControl.module.css';
import type { SearchControlLinks } from './SearchControlLinks';
import { getReferenceHref } from './SearchControlLinks';

/**
 * Configures the right-click menu that {@link SearchControl} shows on rows and reference cells.
 * The menu is a fixed set of three items (Open, Open in a New Tab, Copy Link) that link where the
 * SearchControl's `getResourceHref` and `getReferenceHref` say; these options choose which appear.
 */
export interface SearchControlContextMenuOptions {
  /** Per-item visibility; all default to true. */
  readonly items?: {
    readonly open?: boolean;
    readonly openInNewTab?: boolean;
    readonly copyLink?: boolean;
  };
}

/** The resource a context menu acts on. */
export interface ResourceContextMenuTarget {
  /** Display label for the resource type, e.g. "Practitioner". */
  readonly label: string;
  /** In-app href for the resource, e.g. "/Practitioner/123". */
  readonly href?: string;
  /** Fallback for Open when there is no href. */
  readonly onOpen?: () => void;
  /** Fallback for Open in a New Tab when there is no href. */
  readonly onOpenInNewTab?: () => void;
}

type OpenResourceContextMenu = (event: MouseEvent, target: ResourceContextMenuTarget) => void;

type OpenReferenceContextMenu = (event: MouseEvent, reference: Reference) => void;

const noop: OpenReferenceContextMenu = () => {};

/**
 * Supplies {@link useReferenceContextMenu} to reference cells. Its value is the
 * `openReferenceContextMenu` opener from {@link useResourceContextMenuController}.
 */
export const ReferenceContextMenuContext = createContext<OpenReferenceContextMenu>(noop);

/**
 * Returns the opener for the shared context menu, scoped to a reference. Call it from a reference
 * cell's `onContextMenu` handler. Returns a no-op outside a provider.
 * @returns The context menu open handler.
 */
export function useReferenceContextMenu(): OpenReferenceContextMenu {
  return useContext(ReferenceContextMenuContext);
}

interface VisibleItems {
  readonly open: boolean;
  readonly openInNewTab: boolean;
  readonly copyLink: boolean;
}

interface MenuState {
  readonly opened: boolean;
  readonly x: number;
  readonly y: number;
  readonly target?: ResourceContextMenuTarget;
  readonly visible?: VisibleItems;
}

interface ResourceContextMenuController {
  /** Opener for reference cells; pass it to {@link ReferenceContextMenuContext}. */
  readonly openReferenceContextMenu: OpenReferenceContextMenu;
  /** Open handler for elements rendered directly by the owner (e.g. table rows). */
  readonly openContextMenu: OpenResourceContextMenu;
  /** The menu element; render it once inside the provider. */
  readonly contextMenu: ReactNode;
}

/**
 * Resolves which items a target can show: each needs a link or its own fallback, and can be hidden.
 * @param target - The menu target.
 * @param options - The context menu options.
 * @returns The visible items.
 */
function getVisibleItems(target: ResourceContextMenuTarget, options: SearchControlContextMenuOptions): VisibleItems {
  const items = options.items ?? {};
  return {
    open: items.open !== false && (!!target.href || !!target.onOpen),
    openInNewTab: items.openInNewTab !== false && (!!target.href || !!target.onOpenInNewTab),
    copyLink: items.copyLink !== false && !!target.href,
  };
}

const RELATIVE_REFERENCE = /^([A-Z][A-Za-z]+)\/[^/]+$/;

/**
 * Sets up a single cursor-positioned context menu shared by the table rows and the reference cells.
 * The owner renders {@link ResourceContextMenuController.contextMenu} inside
 * {@link ReferenceContextMenuContext} and wires row `onContextMenu` handlers to
 * {@link ResourceContextMenuController.openContextMenu}; descendant cells reach the same menu via
 * {@link useReferenceContextMenu}. When the menu is turned off, or a right-click leaves no items to
 * show, the event is left alone so the browser's own menu appears.
 * @param options - The context menu options, or false to turn the menu off.
 * @param links - The SearchControl's link functions; reference items use `getReferenceHref`.
 * @returns The controller.
 */
export function useResourceContextMenuController(
  options?: false | SearchControlContextMenuOptions,
  links: SearchControlLinks = {}
): ResourceContextMenuController {
  const navigate = useMedplumNavigate();
  const [state, setState] = useState<MenuState>({ opened: false, x: 0, y: 0 });

  const optionsRef = useRef(options);
  const linksRef = useRef(links);
  useLayoutEffect(() => {
    optionsRef.current = options;
    linksRef.current = links;
  });

  const activeRowRef = useRef<Element | null>(null);

  const clearActiveRow = useCallback(() => {
    activeRowRef.current?.classList.remove(classes.trActive);
    activeRowRef.current = null;
  }, []);

  const openContextMenu = useCallback<OpenResourceContextMenu>(
    (event, target) => {
      const currentOptions = optionsRef.current;
      if (currentOptions === false) {
        return;
      }
      const visible = getVisibleItems(target, currentOptions ?? {});
      if (!visible.open && !visible.openInNewTab && !visible.copyLink) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearActiveRow();
      const row = (event.target as Element).closest('[data-testid="search-control-row"]');
      if (row) {
        row.classList.add(classes.trActive);
        activeRowRef.current = row;
      }
      setState({ opened: true, x: event.clientX, y: event.clientY, target, visible });
    },
    [clearActiveRow]
  );

  const openReferenceContextMenu = useCallback<OpenReferenceContextMenu>(
    (event, reference) => {
      const currentOptions = optionsRef.current;
      if (currentOptions === false) {
        return;
      }
      const label = RELATIVE_REFERENCE.exec(reference.reference ?? '')?.[1];
      if (!label) {
        return;
      }
      openContextMenu(event, { label, href: getReferenceHref(linksRef.current, reference) });
    },
    [openContextMenu]
  );

  const close = useCallback(() => {
    clearActiveRow();
    setState((prev) => ({ ...prev, opened: false }));
  }, [clearActiveRow]);

  const { target, visible } = state;
  const href = target?.href;
  const contextMenu = (
    <Menu opened={state.opened} onClose={close} shadow="md" width="max-content" radius="md" position="bottom-start">
      <Menu.Target>
        <div aria-hidden style={{ position: 'fixed', left: state.x, top: state.y, width: 1, height: 1 }} />
      </Menu.Target>
      <Menu.Dropdown className={classes.menuDropdown}>
        {target && visible && (
          <>
            {visible.open && (
              <Menu.Item
                leftSection={<IconCornerDownRight size={16} color="var(--mantine-color-dimmed)" />}
                onClick={() => {
                  if (href) {
                    navigate(href);
                  } else {
                    target.onOpen?.();
                  }
                  close();
                }}
              >
                Open {target.label}
              </Menu.Item>
            )}
            {visible.openInNewTab && (
              <Menu.Item
                leftSection={<IconExternalLink size={16} color="var(--mantine-color-dimmed)" />}
                onClick={() => {
                  if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                  } else {
                    target.onOpenInNewTab?.();
                  }
                  close();
                }}
              >
                Open {target.label} in a New Tab
              </Menu.Item>
            )}
            {visible.copyLink && href && (
              <Menu.Item
                leftSection={<IconLink size={16} color="var(--mantine-color-dimmed)" />}
                onClick={() => {
                  navigator.clipboard?.writeText(new URL(href, window.location.origin).href).catch(() => undefined);
                  close();
                }}
              >
                Copy Link
              </Menu.Item>
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );

  return { openReferenceContextMenu, openContextMenu, contextMenu };
}
