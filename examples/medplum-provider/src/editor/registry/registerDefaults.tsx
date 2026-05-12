import type { JSX } from 'react';
import { registerComponent } from './componentRegistry';

// Placeholder components for blocks that render in the editor preview.
// These use simple wrappers that display the component name and icon
// since the actual components require specific route/data contexts.

function PlaceholderBlock({ label, icon }: { label: string; icon?: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
        border: '1px dashed #dee2e6',
        borderRadius: 8,
        color: '#868e96',
        fontSize: 14,
        minHeight: 60,
        background: '#f8f9fa',
      }}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </div>
  );
}

export function registerDefaultComponents(): void {
  // Clinical
  registerComponent({
    type: 'PatientSummary',
    name: 'Patient Summary',
    description: 'Patient demographics, allergies, medications, and problems sidebar.',
    category: 'clinical',
    icon: 'IconUser',
    component: ({ label }: { label?: string }) => PlaceholderBlock({ label: label ?? 'Patient Summary', icon: '👤' }),
    defaultProps: {},
    defaultSettings: { width: 350, height: 'fill' },
    propertySchema: [],
  });

  registerComponent({
    type: 'PatientTimeline',
    name: 'Patient Timeline',
    description: 'Chronological timeline of patient activities and events.',
    category: 'clinical',
    icon: 'IconTimeline',
    component: ({ label }: { label?: string }) =>
      PlaceholderBlock({ label: label ?? 'Patient Timeline', icon: '📋' }),
    defaultProps: {},
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [],
  });

  registerComponent({
    type: 'EncounterChart',
    name: 'Encounter Chart',
    description: 'Full encounter chart with notes, tasks, and billing.',
    category: 'clinical',
    icon: 'IconStethoscope',
    component: ({ label }: { label?: string }) =>
      PlaceholderBlock({ label: label ?? 'Encounter Chart', icon: '🩺' }),
    defaultProps: {},
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [],
  });

  // Data
  registerComponent({
    type: 'SearchControl',
    name: 'Search / Table',
    description: 'Searchable, filterable data table for any FHIR resource.',
    category: 'data',
    icon: 'IconSearch',
    component: ({ label }: { label?: string }) =>
      PlaceholderBlock({ label: label ?? 'Search / Table', icon: '🔍' }),
    defaultProps: { resourceType: 'Patient' },
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [
      { key: 'resourceType', label: 'Resource Type', type: 'text', group: 'Data' },
    ],
  });

  registerComponent({
    type: 'ResourceForm',
    name: 'Resource Form',
    description: 'Auto-generated form from FHIR resource schema.',
    category: 'data',
    icon: 'IconForms',
    component: ({ label }: { label?: string }) =>
      PlaceholderBlock({ label: label ?? 'Resource Form', icon: '📝' }),
    defaultProps: { resourceType: 'Patient' },
    defaultSettings: { width: 'fill' },
    propertySchema: [
      { key: 'resourceType', label: 'Resource Type', type: 'text', group: 'Data' },
    ],
  });

  // Communication
  registerComponent({
    type: 'ThreadInbox',
    name: 'Message Inbox',
    description: 'Threaded message inbox for communications.',
    category: 'communication',
    icon: 'IconMail',
    component: ({ label }: { label?: string }) =>
      PlaceholderBlock({ label: label ?? 'Message Inbox', icon: '✉️' }),
    defaultProps: {},
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [],
  });

  // Scheduling
  registerComponent({
    type: 'Calendar',
    name: 'Calendar',
    description: 'Appointment scheduling calendar.',
    category: 'scheduling',
    icon: 'IconCalendar',
    component: ({ label }: { label?: string }) => PlaceholderBlock({ label: label ?? 'Calendar', icon: '📅' }),
    defaultProps: {},
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [],
  });

  // Tasks
  registerComponent({
    type: 'TaskBoard',
    name: 'Task Board',
    description: 'Kanban-style task management board.',
    category: 'tasks',
    icon: 'IconClipboard',
    component: ({ label }: { label?: string }) => PlaceholderBlock({ label: label ?? 'Task Board', icon: '📌' }),
    defaultProps: {},
    defaultSettings: { width: 'fill', height: 'fill' },
    propertySchema: [],
  });

  // Layout
  registerComponent({
    type: 'Spacer',
    name: 'Spacer',
    description: 'Empty space between elements.',
    category: 'layout',
    icon: 'IconSpacing',
    component: ({ height }: { height?: number }) => (
      <div style={{ height: height ?? 24, width: '100%' }} />
    ),
    defaultProps: { height: 24 },
    defaultSettings: { width: 'fill' },
    propertySchema: [
      { key: 'height', label: 'Height (px)', type: 'number', defaultValue: 24 },
    ],
  });

  registerComponent({
    type: 'Divider',
    name: 'Divider',
    description: 'Horizontal line separator.',
    category: 'layout',
    icon: 'IconMinus',
    component: () => (
      <hr style={{ border: 'none', borderTop: '1px solid #dee2e6', margin: '8px 0', width: '100%' }} />
    ),
    defaultProps: {},
    defaultSettings: { width: 'fill' },
    propertySchema: [],
  });

  // Display
  registerComponent({
    type: 'Heading',
    name: 'Heading',
    description: 'Section heading text.',
    category: 'display',
    icon: 'IconHeading',
    component: ({ content, level }: { content?: string; level?: number }) => {
      const lvl = level ?? 2;
      if (lvl === 1) return <h1 style={{ margin: 0 }}>{content ?? 'Heading'}</h1>;
      if (lvl === 3) return <h3 style={{ margin: 0 }}>{content ?? 'Heading'}</h3>;
      return <h2 style={{ margin: 0 }}>{content ?? 'Heading'}</h2>;
    },
    defaultProps: { content: 'Heading', level: 2 },
    defaultSettings: { width: 'fill' },
    propertySchema: [
      { key: 'content', label: 'Text', type: 'text', group: 'Content' },
      {
        key: 'level',
        label: 'Level',
        type: 'select',
        options: [
          { value: '1', label: 'H1' },
          { value: '2', label: 'H2' },
          { value: '3', label: 'H3' },
        ],
        group: 'Content',
      },
    ],
  });

  registerComponent({
    type: 'TextBlock',
    name: 'Text',
    description: 'Paragraph text content.',
    category: 'display',
    icon: 'IconAlignLeft',
    component: ({ content }: { content?: string }) => (
      <p style={{ margin: 0, fontSize: 14, color: '#495057' }}>{content ?? 'Text content goes here.'}</p>
    ),
    defaultProps: { content: 'Text content goes here.' },
    defaultSettings: { width: 'fill' },
    propertySchema: [
      { key: 'content', label: 'Text', type: 'text', group: 'Content' },
    ],
  });

  registerComponent({
    type: 'Card',
    name: 'Card',
    description: 'Container card with border and shadow.',
    category: 'display',
    icon: 'IconSquare',
    component: ({ title }: { title?: string }) => (
      <div
        style={{
          padding: 16,
          border: '1px solid #dee2e6',
          borderRadius: 8,
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <strong>{title ?? 'Card'}</strong>
      </div>
    ),
    defaultProps: { title: 'Card' },
    defaultSettings: { width: 'fill' },
    isContainer: true,
    propertySchema: [
      { key: 'title', label: 'Title', type: 'text', group: 'Content' },
    ],
  });
}
