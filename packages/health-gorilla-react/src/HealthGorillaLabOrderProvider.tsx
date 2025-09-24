// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { JSX, PropsWithChildren } from 'react';
import { HealthGorillaLabOrderContext, UseHealthGorillaLabOrderReturn } from './HealthGorillaLabOrderContext';

/**
 * A provider component that propagates the `useHealthGorillaLabOrder` return value to all children components via [React Context](https://reactjs.org/docs/context.html) API. To be used with {@link useHealthGorillaLabOrderContext}.
 *
 * @param props - entire response of `useHealthGorillaLabOrder`
 * @returns a React context provider component.
 *
 * @example
 * ```tsx
 * function App() {
 *   const labOrderReturn = useHealthGorillaLabOrder({...});
 *   return (
 *     <HealthGorillaLabOrderProvider {...methods} >
 *       <form onSubmit={labOrderReturn.createOrderBundle()}>
 *         <PerformingLabInput />
 *         <input type="submit" />
 *       </form>
 *     </HealthGorillaLabOrderProvider>
 *   );
 * }
 *
 * function PerformingLabInput() {
 *   const { searchAvailableLabs, setPerformingLab } = useHealthGorillaLabOrderContext();
 *   return (
 *     <AsyncAutocomplete<LabOrganization>
 *       maxValues={1}
 *       loadOptions={searchAvailableLabs}
 *       onChange={(item) => {
 *         if (item.length > 0) {
 *           setPerformingLab(item[0]);
 *         } else {
 *           setPerformingLab(undefined);
 *         }
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function HealthGorillaLabOrderProvider(props: PropsWithChildren<UseHealthGorillaLabOrderReturn>): JSX.Element {
  const { children, ...labOrderReturn } = props;
  return (
    <HealthGorillaLabOrderContext.Provider value={labOrderReturn}>{children}</HealthGorillaLabOrderContext.Provider>
  );
}
