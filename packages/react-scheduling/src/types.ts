// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type DateTimeRange = { start: Date; end: Date };

/** A stretch picked on a calendar. `allDay` marks whole days picked in month view, which name no time. */
export type CalendarSelection = DateTimeRange & { allDay?: boolean };
