// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDisclosure } from '@mantine/hooks';

export interface ControllableDisclosureProps {
  /** Controlled open state. When provided, `onOpen`/`onClose` are expected to update it. */
  opened?: boolean;
  /** Called instead of the internal open handler when provided. */
  onOpen?: () => void;
  /** Called instead of the internal close handler when provided. */
  onClose?: () => void;
}

/**
 * Like Mantine's `useDisclosure`, but optionally controlled by the parent.
 * When `opened`/`onOpen`/`onClose` are provided they take precedence over the internal
 * state, letting pages drive modal state externally (e.g. from the URL) while standalone
 * usage keeps working without any props.
 * @param controlled - Optional controlled state and handlers.
 * @returns The resolved open state and open/close handlers.
 */
export function useControllableDisclosure(
  controlled: ControllableDisclosureProps
): [boolean, { open: () => void; close: () => void }] {
  const [internalOpened, handlers] = useDisclosure(false);
  return [
    controlled.opened ?? internalOpened,
    {
      open: controlled.onOpen ?? handlers.open,
      close: controlled.onClose ?? handlers.close,
    },
  ];
}
