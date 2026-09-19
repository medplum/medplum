// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu } from '@mantine/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import { IconArrowUpRight, IconExternalLink, IconLink } from '@tabler/icons-react';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import classes from './SearchControl.module.css';

/** The resource a context menu acts on. */
export interface ResourceContextMenuTarget {
  /** Display label for the resource type, e.g. "Practitioner". */
  readonly label: string;
  /** In-app href for the resource, e.g. "/Practitioner/123". */
  readonly href: string;
}

/** Opens the shared context menu at the cursor for the given resource. */
export type OpenResourceContextMenu = (event: MouseEvent, target: ResourceContextMenuTarget) => void;

const noop: OpenResourceContextMenu = () => {};

const ResourceContextMenuContext = createContext<OpenResourceContextMenu>(noop);

/**
 * Returns the opener for the shared resource context menu. Call it from an `onContextMenu` handler
 * to replace the native browser menu with in-app link actions. Returns a no-op outside a provider.
 * @returns The context menu open handler.
 */
export function useResourceContextMenu(): OpenResourceContextMenu {
  return useContext(ResourceContextMenuContext);
}

interface MenuState {
  readonly opened: boolean;
  readonly x: number;
  readonly y: number;
  readonly target?: ResourceContextMenuTarget;
}

export interface ResourceContextMenuController {
  /** Provider that supplies {@link useResourceContextMenu} to descendant cells. */
  readonly ContextMenuProvider: (props: { readonly children: ReactNode }) => JSX.Element;
  /** Open handler for elements rendered directly by the owner (e.g. table rows). */
  readonly openContextMenu: OpenResourceContextMenu;
  /** The menu element; render it once inside the provider. */
  readonly contextMenu: ReactNode;
}

/**
 * Sets up a single cursor-positioned context menu shared by the table rows and the reference cells.
 * The owner renders {@link ResourceContextMenuController.contextMenu} inside
 * {@link ResourceContextMenuController.ContextMenuProvider} and wires row `onContextMenu` handlers to
 * {@link ResourceContextMenuController.openContextMenu}; descendant cells reach the same menu via
 * {@link useResourceContextMenu}.
 * @returns The controller.
 */
export function useResourceContextMenuController(): ResourceContextMenuController {
  const navigate = useMedplumNavigate();
  const [state, setState] = useState<MenuState>({ opened: false, x: 0, y: 0 });

  // The row the menu is open for keeps its hover background while the cursor is over the menu.
  const activeRowRef = useRef<Element | null>(null);

  const clearActiveRow = useCallback(() => {
    activeRowRef.current?.classList.remove(classes.trActive);
    activeRowRef.current = null;
  }, []);

  const openContextMenu = useCallback<OpenResourceContextMenu>(
    (event, target) => {
      event.preventDefault();
      event.stopPropagation();
      clearActiveRow();
      const row = (event.target as Element).closest('[data-testid="search-control-row"]');
      if (row) {
        row.classList.add(classes.trActive);
        activeRowRef.current = row;
      }
      setState({ opened: true, x: event.clientX, y: event.clientY, target });
    },
    [clearActiveRow]
  );

  const close = useCallback(() => {
    clearActiveRow();
    setState((prev) => ({ ...prev, opened: false }));
  }, [clearActiveRow]);

  const ContextMenuProvider = useCallback(
    ({ children }: { readonly children: ReactNode }): JSX.Element => (
      <ResourceContextMenuContext.Provider value={openContextMenu}>{children}</ResourceContextMenuContext.Provider>
    ),
    [openContextMenu]
  );

  const target = state.target;
  const contextMenu = (
    <Menu opened={state.opened} onClose={close} shadow="md" width="max-content" radius="md" position="bottom-start">
      <Menu.Target>
        <div aria-hidden style={{ position: 'fixed', left: state.x, top: state.y, width: 1, height: 1 }} />
      </Menu.Target>
      <Menu.Dropdown>
        {target && (
          <>
            <Menu.Item
              leftSection={<IconArrowUpRight size={14} />}
              onClick={() => {
                navigate(target.href);
                close();
              }}
            >
              Open {target.label}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconExternalLink size={14} />}
              onClick={() => {
                window.open(target.href, '_blank', 'noopener,noreferrer');
                close();
              }}
            >
              Open {target.label} in a New Tab
            </Menu.Item>
            <Menu.Item
              leftSection={<IconLink size={14} />}
              onClick={() => {
                navigator.clipboard
                  ?.writeText(new URL(target.href, window.location.origin).href)
                  .catch(() => undefined);
                close();
              }}
            >
              Copy Link
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );

  return { ContextMenuProvider, openContextMenu, contextMenu };
}
