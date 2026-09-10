// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useHistory } from '@docusaurus/router';
import { useEffect, type ReactNode } from 'react';

/** Host element the Kapa widget bundle appends to `<body>`. Its shadow root holds the whole UI. */
const WIDGET_CONTAINER_ID = 'kapa-widget-container';

/** Toggled on `<html>` rather than `<body>` so react-helmet cannot clobber it. See custom.css. */
const OPEN_ATTRIBUTE = 'data-kapa-sidebar';

type KapaEvent = 'onModalOpen' | 'onModalClose';

/**
 * Both the preinitialized call queue (see `headTags` in docusaurus.config.ts) and the real widget
 * bundle that replaces it are callable with this signature.
 */
type Kapa = (event: KapaEvent, handler: () => void, option?: 'add' | 'remove') => void;

declare global {
  interface Window {
    Kapa?: Kapa;
  }
}

/**
 * Returns the anchor that was clicked, but only when the click originated inside the Kapa widget.
 *
 * `composedPath()` is what makes this work: the widget lives in an open shadow root, so a listener
 * on `document` sees the host element as the event target, and only the composed path exposes the
 * anchor that was really clicked.
 */
function findWidgetAnchor(event: MouseEvent): HTMLAnchorElement | undefined {
  let anchor: HTMLAnchorElement | undefined;
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement) {
      anchor ??= node;
    } else if (node instanceof HTMLElement && node.id === WIDGET_CONTAINER_ID) {
      return anchor;
    }
  }
  return undefined;
}

export default function Root({ children }: { readonly children: ReactNode }): ReactNode {
  const history = useHistory();

  useEffect(() => {
    const kapa = window.Kapa;
    if (!kapa) {
      return undefined;
    }
    const onOpen = (): void => document.documentElement.setAttribute(OPEN_ATTRIBUTE, 'open');
    const onClose = (): void => document.documentElement.removeAttribute(OPEN_ATTRIBUTE);
    kapa('onModalOpen', onOpen);
    kapa('onModalClose', onClose);
    return () => {
      kapa('onModalOpen', onOpen, 'remove');
      kapa('onModalClose', onClose, 'remove');
      onClose();
    };
  }, []);

  useEffect(() => {
    // Kapa renders answer and source links with target="_blank". Routing same-origin ones through
    // the router instead keeps the conversation on screen, since the widget is mounted outside of
    // the React tree and so survives client-side navigation.
    function onClick(event: MouseEvent): void {
      const opensElsewhere = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (event.defaultPrevented || event.button !== 0 || opensElsewhere) {
        return;
      }
      const anchor = findWidgetAnchor(event);
      if (!anchor?.href || anchor.origin !== window.location.origin) {
        return;
      }
      event.preventDefault();
      history.push(anchor.pathname + anchor.search + anchor.hash);
    }

    // Capture phase, so this runs before the widget's own handler opens a tab.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [history]);

  return <>{children}</>;
}
