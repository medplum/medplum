// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { UserScopeWidget } from './UserScopeWidget';

describe('UserScopeWidget', () => {
  test('renders Project badge for project scope', () => {
    render(<UserScopeWidget scope="project" />);
    expect(screen.getByText('Project')).toBeInTheDocument();
  });

  test('renders Global badge for global scope', () => {
    render(<UserScopeWidget scope="global" />);
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  test('renders skeleton placeholder while loading', () => {
    const { container } = render(<UserScopeWidget scope="loading" />);
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Global')).not.toBeInTheDocument();
    expect(container.querySelector('.mantine-Skeleton-root')).toBeInTheDocument();
  });
});
