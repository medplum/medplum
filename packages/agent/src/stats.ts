// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
const currentStats = {
  hl7ConnectionsOpen: 0,
};

export function getCurrentStats(): typeof currentStats {
  return { ...currentStats };
}

export type StatName = keyof typeof currentStats;

export function updateStat(name: StatName, value: (typeof currentStats)[StatName]): void {
  currentStats[name] = value;
}
