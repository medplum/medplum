// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext } from 'react';
import type { SchedulingContextValue } from './SchedulingContext';

export const SchedulingContext = createContext<SchedulingContextValue | undefined>(undefined);
