import { Meta } from '@storybook/react';
import React from 'react';
import { Header, HeaderProps, SidebarLink } from '../Header';
import { useMedplumContext } from '../MedplumProvider';

export default {
  title: 'Medplum/Header',
  component: Header,
} as Meta;

const manyLinks: SidebarLink[] = new Array(50).fill(0).map((el, index) => ({
  label: 'Link ' + (index + 1),
  href: '/link/' + index,
}));

export const Basic = (args: HeaderProps) => {
  const ctx = useMedplumContext();
  return (
    <Header
      onLogo={() => alert('Logo!')}
      onProfile={() => alert('Profile!')}
      onSignOut={() => {
        alert('Sign out!');
        ctx.medplum.signOut();
      }}
      sidebarLinks={[
        {
          title: 'Favorites',
          links: [
            { label: 'Patient', href: '/Patient' },
            { label: 'Observation', href: '/Observation' },
            { label: 'Practitioner', href: '/Practitioner' },
          ],
        },
        {
          title: 'More',
          links: manyLinks,
        },
      ]}
      {...args}
    />
  );
};
