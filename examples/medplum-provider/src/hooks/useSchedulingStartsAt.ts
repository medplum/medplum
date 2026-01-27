// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';

// Get a stable Date (changing once per minute) representing a time at
// least `minimumNoticeMinutes` into the future.
export function useSchedulingStartsAt({ minimumNoticeMinutes }: { minimumNoticeMinutes: number }): Date {
  const [schedulingStartsAt, setSchedulingStartsAt] = useState<Date>(
    () => new Date(Date.now() + 1000 * 60 * minimumNoticeMinutes)
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setSchedulingStartsAt(new Date(Date.now() + 1000 * 60 * minimumNoticeMinutes));
    }, 1000 * 60);
    return () => clearInterval(timer);
  }, [minimumNoticeMinutes]);
  return schedulingStartsAt;
}
