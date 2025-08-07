// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Schedule } from '@medplum/fhirtypes';
import { createContext } from 'react';

export const ScheduleContext = createContext<{ schedule?: Schedule }>({});
