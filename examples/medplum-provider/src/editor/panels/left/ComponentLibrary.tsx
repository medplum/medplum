import type { JSX } from 'react';
import { getAllComponents } from '../../registry/componentRegistry';
import classes from './LeftPanel.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  data: 'Data & Tables',
  communication: 'Communication',
  scheduling: 'Scheduling',
  tasks: 'Tasks',
  layout: 'Layout',
  navigation: 'Navigation',
  display: 'Display',
};

const CATEGORY_ORDER = ['clinical', 'data', 'communication', 'scheduling', 'tasks', 'layout', 'display'];

export function ComponentLibrary(): JSX.Element {
  const allComponents = getAllComponents();

  // Group by category
  const grouped = new Map<string, typeof allComponents>();
  for (const comp of allComponents) {
    const existing = grouped.get(comp.category) ?? [];
    existing.push(comp);
    grouped.set(comp.category, existing);
  }

  return (
    <div>
      {CATEGORY_ORDER.map((category) => {
        const components = grouped.get(category);
        if (!components?.length) return null;
        return (
          <div key={category}>
            <div className={classes.sectionHeader}>{CATEGORY_LABELS[category] ?? category}</div>
            <div className={classes.componentGrid}>
              {components.map((comp) => (
                <div key={comp.type} className={classes.componentCard} title={comp.description}>
                  <span className={classes.componentCardIcon}>
                    {getComponentEmoji(comp.type)}
                  </span>
                  <span>{comp.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getComponentEmoji(type: string): string {
  const map: Record<string, string> = {
    PatientSummary: '👤',
    PatientTimeline: '📋',
    EncounterChart: '🩺',
    SearchControl: '🔍',
    ResourceForm: '📝',
    ThreadInbox: '✉️',
    Calendar: '📅',
    TaskBoard: '📌',
    Spacer: '↕️',
    Divider: '—',
    Heading: 'H',
    TextBlock: 'T',
    Card: '▢',
  };
  return map[type] ?? '⬜';
}
