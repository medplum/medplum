import { capitalize } from '@medplum/core';
import { Task } from '@medplum/fhirtypes';

/**
 * Calculates a score for a task.
 * Higher scores are more important.
 * @param task The task.
 * @returns The score.
 */
export function scoreTask(task: Task): number {
  let secondsRemaining = 24 * 3600; // Default time remaining is 24 hours
  if (task.restriction?.period?.end) {
    secondsRemaining = (new Date(task.restriction.period.end).getTime() - Date.now()) / 1000;
  }

  let priorityMultiplier = 1;
  if (task.priority) {
    priorityMultiplier =
      {
        routine: 1,
        urgent: 2,
        asap: 4,
        stat: 8,
      }[task.priority] || 1;
  }

  return Math.max(1, 24 * 3600 - secondsRemaining) * priorityMultiplier;
}

export function formatDueDate(task: Task): string {
  const remaining = getRemainingTime(task);
  if (!remaining) {
    return '';
  }
  if (remaining.minutes < 0) {
    console.log('overdue?', remaining, new Date().toISOString(), task.restriction?.period?.end);
    return 'overdue';
  }
  if (remaining.days > 1) {
    return `in ${remaining.days} days`;
  }
  if (remaining.days === 1) {
    return `in 1 day`;
  }
  if (remaining.hours > 1) {
    return `in ${remaining.hours} hours`;
  }
  if (remaining.hours === 1) {
    return `in 1 hour`;
  }
  if (remaining.minutes > 1) {
    return `in ${remaining.minutes} min`;
  }
  if (remaining.minutes === 1) {
    return `in 1 min`;
  }
  return 'now';
}

export function getTaskColor(task: Task): string {
  if (task.status === 'cancelled') {
    return 'gray';
  }
  if (task.status === 'completed') {
    return 'blue';
  }
  const remaining = getRemainingTime(task);
  if (!remaining || remaining.days > 0) {
    return 'green';
  }
  if (remaining.hours > 12) {
    return 'yellow';
  }
  if (remaining.hours >= 1) {
    return 'orange';
  }
  if (remaining.minutes >= 0) {
    return 'red';
  }
  return 'blinking';
}

export function getRemainingTime(task: Task): { days: number; hours: number; minutes: number } | undefined {
  const dateTime = task?.restriction?.period?.end;
  if (!dateTime) {
    return undefined;
  }
  const dueDate = new Date(dateTime);
  const diff = dueDate.getTime() - Date.now();
  const minutes = Math.floor(diff / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return { days, hours, minutes };
}

export function getShortName(display: string | undefined): string {
  display = display?.trim();
  if (!display) {
    return '';
  }
  const words = display.split(' ');
  if (words.length === 1) {
    return words[0];
  }
  return capitalize(words[0]) + ' ' + words[words.length - 1].charAt(0).toUpperCase();
}
