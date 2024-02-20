import { ProjectMembership } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ChooseProfileForm } from './ChooseProfileForm';

export default {
  title: 'Medplum/Auth/ChooseProfileForm',
  component: ChooseProfileForm,
} as Meta;

export function FewMemberships(): JSX.Element {
  return (
    <Document width={450}>
      <ChooseProfileForm
        login="x"
        memberships={[
          makeMembership('prod', 'Prod', 'Homer Simpson'),
          makeMembership('staging', 'Staging', 'Homer Simpson'),
        ]}
        handleAuthResponse={console.log}
      />
    </Document>
  );
}

export function ManyMemberships(): JSX.Element {
  const memberships = [];
  for (let i = 1; i <= 30; i++) {
    memberships.push(makeMembership('membership' + i, 'Project ' + i, 'Profile ' + i));
  }
  return (
    <Document width={450}>
      <ChooseProfileForm login="x" memberships={memberships} handleAuthResponse={console.log} />
    </Document>
  );
}

function makeMembership(id: string, projectName: string, profileName: string): ProjectMembership {
  return {
    resourceType: 'ProjectMembership',
    id,
    project: { reference: 'Project/' + projectName, display: projectName },
    user: { reference: 'User/x', display: 'x' },
    profile: { reference: 'Practitioner/' + profileName, display: profileName },
  };
}
