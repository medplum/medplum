import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { Logo } from '../Logo/Logo';
import { AppShell } from './AppShell';

export default {
  title: 'Medplum/AppShell',
  component: AppShell,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AppShell
      logo={<Logo size={24} />}
      version="your.version"
      menus={[
        {
          title: 'My Menu',
          links: [
            { label: 'Link 1', href: '/link1' },
            { label: 'Link 2', href: '/link2' },
            { label: 'Link 3', href: '/link3' },
          ],
        },
      ]}
    >
      Your application here
    </AppShell>
  </Document>
);
