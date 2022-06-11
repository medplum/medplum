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
  return <Header {...args} />;
};

export const CustomColor = (args: HeaderProps): JSX.Element => {
  return (
    <>
      <Header title="Medplum" {...args} />
      <Spacer />
      <Header title="AWS" bgColor="#232f3e" {...args} />
      <Spacer />
      <Header title="Facebook" bgColor="#4267B2" {...args} />
      <Spacer />
      <Header title="GitHub" bgColor="#161b22" {...args} />
      <Spacer />
      <Header title="GitLab" bgColor="#292961" {...args} />
      <Spacer />
      <Header title="Google Cloud" bgColor="#1a73e8" {...args} />
      <Spacer />
      <Header title="Gradient" bgColor="linear-gradient(to right, #e66465, #9198e5)" {...args} />
    </>
  );
};

export const Search = (args: HeaderProps): JSX.Element => {
  const ctx = useMedplumContext();
  const medplum = ctx.medplum;

  medplum.graphql = async () => {
    return {
      data: {
        Patients1: [
          {
            resourceType: 'Patient',
            id: '1',
            name: [{ given: ['Homer'], family: 'Simpson' }],
            birthDate: '1950-01-01',
          },
        ],
        ServiceRequestList: [
          {
            resourceType: 'ServiceRequest',
            id: '000000-0000-0000-0000-000000000000',
            identifier: [
              {
                system: 'barcode',
                value: '9001',
              },
            ],
            subject: {
              display: 'Patient 1',
            },
          },
        ],
      },
    };
  };

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

function Spacer(): JSX.Element {
  return <div style={{ height: 50, minHeight: 50 }} />;
}
