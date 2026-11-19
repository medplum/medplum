// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PlanDefinition } from '@medplum/fhirtypes';
import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { render } from '../../test-utils/render';
import { PlanDefinitionSummary } from './PlanDefinitionSummary';

describe('PlanDefinitionSummary', () => {
  const setup = (planDefinition: PlanDefinition | undefined): ReturnType<typeof render> => {
    return render(<PlanDefinitionSummary planDefinition={planDefinition} />);
  };

  test('renders nothing when planDefinition is undefined', () => {
    setup(undefined);
    expect(screen.queryByText('Included Tasks')).not.toBeInTheDocument();
  });

  test('renders nothing when planDefinition has no actions', () => {
    setup({ resourceType: 'PlanDefinition', status: 'active' });
    expect(screen.queryByText('Included Tasks')).not.toBeInTheDocument();
  });

  test('renders nothing when planDefinition has an empty action list', () => {
    setup({ resourceType: 'PlanDefinition', status: 'active', action: [] });
    expect(screen.queryByText('Included Tasks')).not.toBeInTheDocument();
  });

  test('renders heading and a line per action', () => {
    setup({
      resourceType: 'PlanDefinition',
      status: 'active',
      action: [
        { id: 'action-1', title: 'Intake Questionnaire' },
        { id: 'action-2', title: 'Vitals Measurement' },
      ],
    });

    expect(screen.getByText('Included Tasks')).toBeInTheDocument();
    expect(screen.getByText('- Intake Questionnaire')).toBeInTheDocument();
    expect(screen.getByText('- Vitals Measurement')).toBeInTheDocument();
  });
});
