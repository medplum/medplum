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
