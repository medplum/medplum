// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDisclosure } from '@mantine/hooks';

/**
 * ControllableDisclosureProps is the optional controlled state for the useControllableDisclosure hook.
 * @property opened - Controlled open state. When provided, `onOpen`/`onClose` are expected to update it.
 * @property onOpen - Called instead of the internal open handler when provided.
 * @property onClose - Called instead of the internal close handler when provided.
 */
export interface ControllableDisclosureProps {
  opened?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * ControllableDisclosureHandlers are the resolved open/close handlers returned by the useControllableDisclosure hook.
 * @property open - Opens the disclosure.
 * @property close - Closes the disclosure.
 */
export interface ControllableDisclosureHandlers {
  open: () => void;
  close: () => void;
}

export type ControllableDisclosureState = [opened: boolean, handlers: ControllableDisclosureHandlers];

/**
 * Like Mantine's `useDisclosure`, but optionally controlled by the parent.
 * When `opened`/`onOpen`/`onClose` are provided they take precedence over the internal
 * state, letting pages drive modal state externally (e.g. from the URL) while standalone
 * usage keeps working without any props.
 * @param controlled - Optional controlled state and handlers.
 * @returns The resolved open state and open/close handlers.
 */
export function useControllableDisclosure(controlled: ControllableDisclosureProps): ControllableDisclosureState {
  const [internalOpened, handlers] = useDisclosure(false);
  return [
    controlled.opened ?? internalOpened,
    {
      open: controlled.onOpen ?? handlers.open,
      close: controlled.onClose ?? handlers.close,
    },
  ];
}
