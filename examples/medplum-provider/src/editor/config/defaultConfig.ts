import type { EditorConfiguration } from '../types';

/**
 * Generates the default EditorConfiguration based on the current
 * medplum-provider app structure. This captures the existing pages,
 * navigation menus, and theme as an editable configuration.
 */
export function generateDefaultConfig(): EditorConfiguration {
  const now = new Date().toISOString();

  return {
    version: 1,
    meta: {
      name: 'Medplum Provider',
      description: 'Default theme configuration for the Medplum Provider application.',
      createdAt: now,
      updatedAt: now,
    },
    theme: {
      colors: {
        primary: '#228be6',
        accent1: '#121212',
        accent2: '#45C0B6',
        background1: '#FAFAF9',
        background2: '#6B6B6B',
        textPrimary: '#000000',
        textSecondary: '#868e96',
        success: '#40c057',
        warning: '#fab005',
        error: '#fa5252',
        info: '#228be6',
      },
      typography: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSizes: {
          xs: '0.6875rem',
          sm: '0.875rem',
          md: '0.875rem',
          lg: '1.0rem',
          xl: '1.125rem',
        },
        headingSizes: {
          h1: { fontSize: '1.125rem', fontWeight: '500', lineHeight: '2.0' },
          h2: { fontSize: '1rem', fontWeight: '500', lineHeight: '1.5' },
          h3: { fontSize: '0.875rem', fontWeight: '500', lineHeight: '1.5' },
        },
      },
      layout: {
        pageMaxWidth: 1200,
        contentPadding: 24,
        sidebarWidth: 350,
        borderRadius: 'sm',
        spacing: 'md',
      },
      components: {
        buttons: {
          borderRadius: 'sm',
          defaultVariant: 'filled',
        },
        inputs: {
          borderRadius: 'sm',
          variant: 'default',
        },
        cards: {
          borderRadius: 'sm',
          shadow: 'sm',
          withBorder: true,
        },
      },
    },
    navigation: {
      logo: { type: 'default', size: 24 },
      menus: [
        {
          links: [
            { icon: 'IconBook2', label: 'Spaces', href: '/Spaces/Communication' },
            { icon: 'IconUsers', label: 'Patients', href: '/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated' },
            { icon: 'IconCalendarEvent', label: 'Schedule', href: '/schedule' },
            { icon: 'IconMail', label: 'Messages', href: '/Communication?status=in-progress' },
            { icon: 'IconClipboardCheck', label: 'Tasks', href: '/Task' },
          ],
        },
        {
          title: 'Quick Links',
          links: [
            { icon: 'IconUserPlus', label: 'New Patient', href: '/onboarding' },
            { icon: 'IconApps', label: 'Integrations', href: '/integrations' },
          ],
        },
      ],
    },
    pages: [
      {
        id: 'page-patients',
        name: 'Patients',
        routePattern: '/Patient',
        icon: 'IconUsers',
        settings: { layout: 'full-width', padding: 0 },
        sections: [
          {
            id: 'sec-patients-main',
            name: 'Patient Search',
            type: 'content',
            settings: { direction: 'vertical', padding: 16 },
            blocks: [
              {
                id: 'blk-patient-search',
                name: 'Patient Search Table',
                componentType: 'SearchControl',
                props: { resourceType: 'Patient' },
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
      {
        id: 'page-patient-detail',
        name: 'Patient Detail',
        routePattern: '/Patient/:patientId',
        icon: 'IconUser',
        settings: { layout: 'sidebar-content', padding: 0 },
        sections: [
          {
            id: 'sec-patient-sidebar',
            name: 'Sidebar',
            type: 'sidebar',
            settings: { width: 350, direction: 'vertical', overflow: 'auto' },
            locked: true,
            blocks: [
              {
                id: 'blk-patient-summary',
                name: 'Patient Summary',
                componentType: 'PatientSummary',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
          {
            id: 'sec-patient-content',
            name: 'Content',
            type: 'tabs',
            settings: { direction: 'vertical', padding: 16 },
            blocks: [
              {
                id: 'blk-patient-timeline',
                name: 'Timeline',
                componentType: 'PatientTimeline',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
      {
        id: 'page-schedule',
        name: 'Schedule',
        routePattern: '/schedule',
        icon: 'IconCalendarEvent',
        settings: { layout: 'full-width', padding: 0 },
        sections: [
          {
            id: 'sec-schedule-main',
            name: 'Calendar',
            type: 'content',
            settings: { direction: 'vertical', padding: 16 },
            blocks: [
              {
                id: 'blk-calendar',
                name: 'Appointment Calendar',
                componentType: 'Calendar',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
      {
        id: 'page-messages',
        name: 'Messages',
        routePattern: '/Communication',
        icon: 'IconMail',
        settings: { layout: 'full-width', padding: 0 },
        sections: [
          {
            id: 'sec-messages-main',
            name: 'Inbox',
            type: 'content',
            settings: { direction: 'vertical', padding: 0 },
            blocks: [
              {
                id: 'blk-messages-inbox',
                name: 'Message Inbox',
                componentType: 'ThreadInbox',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
      {
        id: 'page-tasks',
        name: 'Tasks',
        routePattern: '/Task',
        icon: 'IconClipboardCheck',
        settings: { layout: 'full-width', padding: 0 },
        sections: [
          {
            id: 'sec-tasks-main',
            name: 'Task Board',
            type: 'content',
            settings: { direction: 'vertical', padding: 16 },
            blocks: [
              {
                id: 'blk-task-board',
                name: 'Task Board',
                componentType: 'TaskBoard',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
      {
        id: 'page-spaces',
        name: 'Spaces',
        routePattern: '/Spaces/Communication',
        icon: 'IconBook2',
        settings: { layout: 'full-width', padding: 0 },
        sections: [
          {
            id: 'sec-spaces-main',
            name: 'Spaces',
            type: 'content',
            settings: { direction: 'vertical', padding: 0 },
            blocks: [
              {
                id: 'blk-spaces',
                name: 'Spaces Chat',
                componentType: 'ThreadInbox',
                props: {},
                settings: { width: 'fill', height: 'fill' },
              },
            ],
          },
        ],
      },
    ],
  };
}
