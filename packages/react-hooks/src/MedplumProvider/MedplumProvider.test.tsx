import { getDisplayString, ProfileResource } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { useMedplum, useMedplumContext, useMedplumNavigate, useMedplumProfile } from './MedplumProvider.context';

function MyComponent(): JSX.Element {
  const medplum = useMedplum();
  const context = useMedplumContext();
  const navigate = useMedplumNavigate();
  const profile = useMedplumProfile();

  return (
    <div>
      <div>MyComponent</div>
      <div>{getDisplayString(medplum.getProfile() as ProfileResource)}</div>
      <div>Context: {Boolean(context).toString()}</div>
      <div>Navigate: {Boolean(navigate).toString()}</div>
      <div>Profile: {Boolean(profile).toString()}</div>
    </div>
  );
}

function setup(): void {
  render(
    <MedplumProvider medplum={new MockClient()}>
      <MyComponent />
    </MedplumProvider>
  );
}

describe('MedplumProvider', () => {
  test('Renders component', () => {
    setup();
    expect(screen.getByText('MyComponent')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Context: true')).toBeInTheDocument();
    expect(screen.getByText('Navigate: true')).toBeInTheDocument();
    expect(screen.getByText('Profile: true')).toBeInTheDocument();
  });
});
