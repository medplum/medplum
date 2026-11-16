// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { InfoBar, InfoBarSkeleton } from './InfoBar';

describe('InfoBar', () => {
  test('Renders entries', () => {
    render(
      <InfoBar>
        <InfoBar.Entry>
          <InfoBar.Key>Name</InfoBar.Key>
          <InfoBar.Value>Homer Simpson</InfoBar.Value>
        </InfoBar.Entry>
      </InfoBar>
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders skeleton', () => {
    render(<InfoBarSkeleton withAvatar entries={3} />);
    expect(screen.getByTestId('info-bar-skeleton')).toBeInTheDocument();
  });
});
