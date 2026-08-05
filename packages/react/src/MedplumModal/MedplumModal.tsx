// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ModalProps } from '@mantine/core';
import { Modal } from '@mantine/core';
import cx from 'clsx';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { Form } from '../Form/Form';
import classes from './MedplumModal.module.css';

/**
 * Keeps the flex chain intact across the form element, so the footer stays pinned. Inline rather
 * than in the CSS module because `Form` takes a style but not a className.
 */
const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minHeight: 0,
};

/**
 * Props for {@link MedplumModal}.
 * @property children - Modal body, rendered in the scrolling region between the header and the
 * footer.
 * @property actions - Buttons pinned to the bottom edge of the modal above a full-bleed border.
 * They stretch to the full width with the primary action first; pass a single `Group` for a
 * right-aligned row instead. Omit for modals that only display content - the footer and its border
 * are then not rendered.
 * @property onSubmit - Wraps the body and the footer in a {@link Form}, so a `SubmitButton` in
 * `actions` submits the named inputs in `children`. A `SubmitButton` without this has no form to
 * submit and does nothing.
 * @property bodyHeight - Fixed body height as a CSS length, e.g. `'60vh'`, for modals whose content
 * is a fixed layout rather than a form that should size to its fields. Omit to size to the content.
 */
export interface MedplumModalProps extends Omit<ModalProps, 'children' | 'onSubmit' | 'scrollAreaComponent'> {
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly onSubmit?: (formData: Record<string, string>) => Promise<void> | void;
  readonly bodyHeight?: string;
}

/**
 * A modal with the standard Medplum chrome: a bold title above a border, one scrolling body, and
 * action buttons pinned to the bottom edge. Owns the layout so call sites pass content and actions
 * rather than assembling a shell out of `Stack`, `Divider` and `styles` overrides.
 *
 * All other Mantine `Modal` props pass through. `scrollAreaComponent` does not, because it inserts
 * an element between the content and the body that breaks the flex chain the pinned footer needs.
 * @param props - The MedplumModal React props.
 * @returns The MedplumModal React node.
 */
export function MedplumModal(props: MedplumModalProps): JSX.Element {
  const {
    children,
    actions,
    onSubmit,
    bodyHeight,
    classNames,
    style,
    closeButtonProps,
    centered = true,
    padding = 'lg',
    radius = 'md',
    ...modalProps
  } = props;

  const contents = (
    <>
      <div className={classes.scroll}>{children}</div>
      {actions && <div className={classes.footer}>{actions}</div>}
    </>
  );

  return (
    <Modal
      {...modalProps}
      centered={centered}
      padding={padding}
      radius={radius}
      closeButtonProps={{ 'aria-label': 'Close', radius: 'xl', ...closeButtonProps }}
      classNames={{
        ...classNames,
        content: cx(classes.content, classNames?.content),
        header: cx(classes.header, classNames?.header),
        title: cx(classes.title, classNames?.title),
        body: cx(classes.body, classNames?.body),
      }}
      style={bodyHeight ? [style, { '--medplum-modal-body-height': bodyHeight }] : style}
    >
      {onSubmit ? (
        <Form onSubmit={onSubmit} style={formStyle}>
          {contents}
        </Form>
      ) : (
        contents
      )}
    </Modal>
  );
}
