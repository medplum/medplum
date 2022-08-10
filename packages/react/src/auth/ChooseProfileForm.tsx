import { ProjectMembership } from '@medplum/fhirtypes';
import React from 'react';
import { Avatar } from '../Avatar';
import { Logo } from '../Logo';
import { useMedplum } from '../MedplumProvider';

export interface ChooseProfileFormProps {
  login: string;
  memberships: ProjectMembership[];
  handleAuthResponse: (response: any) => void;
}

export function ChooseProfileForm(props: ChooseProfileFormProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <div>
      <div className="medplum-center">
        <Logo size={32} />
        <h1>Choose profile</h1>
      </div>
      {props.memberships.map((membership: ProjectMembership) => (
        <div
          className="medplum-nav-menu-profile"
          key={membership.id}
          onClick={() => {
            medplum
              .post('auth/profile', {
                login: props.login,
                profile: membership.id,
              })
              .then(props.handleAuthResponse)
              .catch(console.log);
          }}
        >
          <div className="medplum-nav-menu-profile-icon">
            <Avatar alt={membership.profile?.display} />
          </div>
          <div className="medplum-nav-menu-profile-label">
            {membership.profile?.display}
            <div className="medplum-nav-menu-profile-help-text">{membership.project?.display}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
