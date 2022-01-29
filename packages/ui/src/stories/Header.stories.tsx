import { UserConfigurationMenuLink } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { Header, HeaderProps } from '../Header';
import { useMedplumContext } from '../MedplumProvider';

export default {
  title: 'Medplum/Header',
  component: Header,
} as Meta;

const manyLinks: UserConfigurationMenuLink[] = new Array(50).fill(0).map((el, index) => ({
  name: 'Link ' + (index + 1),
  target: '/link/' + index,
}));

export const Basic = (args: HeaderProps): JSX.Element => {
  const ctx = useMedplumContext();
  return (
    <Header
      onLogo={() => alert('Logo!')}
      onProfile={() => alert('Profile!')}
      onSignOut={() => {
        alert('Sign out!');
        ctx.medplum.signOut();
      }}
      config={{
        resourceType: 'UserConfiguration',
        menu: [
          {
            title: 'Favorites',
            link: [
              { name: 'Patient', target: '/Patient' },
              { name: 'Observation', target: '/Observation' },
              { name: 'Practitioner', target: '/Practitioner' },
            ],
          },
          {
            title: 'More',
            link: manyLinks,
          },
        ],
      }}
      {...args}
    />
  );
};
