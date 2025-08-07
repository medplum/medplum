// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { Coverage, Organization } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { CoverageItem, Insurance } from './Insurance';

const medplum = new MockClient();

// Mock organization for testing
const mockInsuranceOrg: Organization = {
  resourceType: 'Organization',
  id: 'insurance-org-1',
  name: 'Blue Cross Blue Shield',
  active: true,
  identifier: [
    {
      system: 'http://example.com/insurance-orgs',
      value: 'blue-cross',
    },
  ],
  type: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/organization-type',
          code: 'ins',
          display: 'Insurance Company',
        },
      ],
    },
  ],
};

describe('PatientSummary - Insurance', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty when no coverages', async () => {
    await setup(<Insurance coverages={[]} />);

    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('Renders empty when no active coverages', async () => {
    const inactiveCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'cancelled',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
      },
    ];

    await setup(<Insurance coverages={inactiveCoverages} />);

    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('Renders active coverage with organization name', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
        period: {
          end: '2024-12-31',
        },
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('ID: 123456789')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('Renders unknown payor when payor resource not found', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [{ reference: 'Organization/unknown' }],
        subscriberId: '123456789',
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('Unknown Payor')).toBeInTheDocument();
  });

  test('Renders coverage without subscriber ID', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('ID: N/A')).toBeInTheDocument();
  });

  test('Renders coverage with class information', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
        class: [
          {
            type: {
              coding: [
                {
                  code: 'group',
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                },
              ],
            },
            value: 'EMPLOYEE',
          },
          {
            type: {
              coding: [
                {
                  code: 'subgroup',
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                },
              ],
            },
            value: 'FULL_TIME',
          },
        ],
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('ID: 123456789 · Group: EMPLOYEE · Subgroup: FULL_TIME')).toBeInTheDocument();
  });

  test('Filters out plan class information', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
        class: [
          {
            type: {
              coding: [
                {
                  code: 'plan',
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                },
              ],
            },
            value: 'PREMIUM_PLAN',
          },
          {
            type: {
              coding: [
                {
                  code: 'group',
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                },
              ],
            },
            value: 'EMPLOYEE',
          },
        ],
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    // Should only show group, not plan
    expect(screen.getByText('ID: 123456789 · Group: EMPLOYEE')).toBeInTheDocument();
    expect(screen.queryByText('PREMIUM_PLAN')).not.toBeInTheDocument();
  });

  test('Renders multiple active coverages', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
      },
      {
        resourceType: 'Coverage',
        id: 'coverage-2',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '987654321',
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('ID: 123456789')).toBeInTheDocument();
    expect(screen.getByText('ID: 987654321')).toBeInTheDocument();
  });

  test('Calls onClickResource when coverage item is clicked', async () => {
    const mockOnClickResource = jest.fn();
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
      },
    ];

    await setup(<Insurance coverages={activeCoverages} onClickResource={mockOnClickResource} />);
    await act(async () => {
      fireEvent.click(screen.getByText('ID: 123456789'));
    });

    expect(mockOnClickResource).toHaveBeenCalledWith(activeCoverages[0]);
  });

  test('Does not call onClickResource when not provided', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    // Find the first clickable summary item by looking for elements with SummaryItem class or role
    const summaryItems =
      screen.getAllByRole('button').length > 0
        ? screen.getAllByRole('button')
        : document.querySelectorAll('[class*="SummaryItem"], [data-testid*="summary-item"]');

    // Should not throw error when clicking
    await act(async () => {
      fireEvent.click(summaryItems[0] as HTMLElement);
    });
  });

  test('Renders coverage without end date', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
        period: {
          start: '2024-01-01',
        },
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    expect(screen.getByText('Ends')).toBeInTheDocument();
  });

  test('capitalizeWords utility function works correctly', async () => {
    const activeCoverages: Coverage[] = [
      {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: createReference(HomerSimpson),
        payor: [createReference(mockInsuranceOrg)],
        subscriberId: '123456789',
        class: [
          {
            type: {
              coding: [
                {
                  code: 'sub group',
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                },
              ],
            },
            value: 'TEST_VALUE',
          },
        ],
      },
    ];

    await setup(<Insurance coverages={activeCoverages} />);

    // Should capitalize each word properly
    expect(screen.getByText('ID: 123456789 · Sub Group: TEST_VALUE')).toBeInTheDocument();
  });

  test('Renders coverage with organization', async () => {
    const coverages: Coverage = {
      resourceType: 'Coverage',
      id: 'coverage-1',
      status: 'active',
      beneficiary: createReference(HomerSimpson),
      payor: [createReference(mockInsuranceOrg)],
      subscriberId: '123456789',
    };

    await setup(<CoverageItem coverage={coverages} organization={mockInsuranceOrg} />);

    expect(screen.getByText('Blue Cross Blue Shield')).toBeInTheDocument();
  });
});
