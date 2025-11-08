// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';

const PRIORITY_ORDER: Record<string, number> = {
  stat: 0,
  urgent: 1,
  asap: 2,
  routine: 3,
};

/**
 * Sort tasks by:
 * 1. Priority (stat > urgent > asap > routine)
 * 2. Due date (soonest first)
 * 3. Created date (oldest first)
 * @param tasks - Array of tasks to sort
 * @returns Sorted array of tasks
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // 1. Sort by priority
    const priorityA = PRIORITY_ORDER[a.priority || 'routine'];
    const priorityB = PRIORITY_ORDER[b.priority || 'routine'];
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 2. Sort by due date (restriction.period.end)
    const dueDateA = a.restriction?.period?.end;
    const dueDateB = b.restriction?.period?.end;
    if (dueDateA && dueDateB) {
      const dateCompare = new Date(dueDateA).getTime() - new Date(dueDateB).getTime();
      if (dateCompare !== 0) {
        return dateCompare;
      }
    }
    // Tasks with due dates come before tasks without
    if (dueDateA && !dueDateB) {
      return -1;
    }
    if (!dueDateA && dueDateB) {
      return 1;
    }

    // 3. Sort by created date (authoredOn)
    const createdA = a.authoredOn ? new Date(a.authoredOn).getTime() : 0;
    const createdB = b.authoredOn ? new Date(b.authoredOn).getTime() : 0;
    return createdA - createdB;
  });
}
