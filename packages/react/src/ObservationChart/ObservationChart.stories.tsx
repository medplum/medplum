// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Meta, StoryObj } from '@storybook/react';
import { ObservationChart } from './ObservationChart';

const meta: Meta<typeof ObservationChart> = {
  title: 'Medplum/ObservationChart',
  component: ObservationChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ObservationChart>;

export const Basic: Story = {
  args: {
    observation: {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '8867-4',
            display: 'Heart rate',
          },
        ],
      },
      subject: {
        reference: 'Patient/123',
      },
      effectiveDateTime: '2024-01-01T10:00:00Z',
      valueQuantity: {
        value: 72,
        unit: 'beats/minute',
        system: 'http://unitsofmeasure.org',
        code: '/min',
      },
    },
  },
};

