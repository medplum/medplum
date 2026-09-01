// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type * as DoseSpotReactModule from '@medplum/dosespot-react';
import { useDoseSpotPharmacySearch } from '@medplum/dosespot-react';
import type { Organization } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import type * as MedplumReactModule from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { DoseSpotPharmacyDialog } from './DoseSpotPharmacyDialog';

type PharmacyDialogProps = MedplumReactModule.PharmacyDialogProps;

let lastPharmacyDialogProps: PharmacyDialogProps | undefined;

vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MedplumReactModule>();
  return {
    ...actual,
    PharmacyDialog: (props: PharmacyDialogProps): JSX.Element => {
      lastPharmacyDialogProps = props;
      return <div data-testid="pharmacy-dialog" />;
    },
  };
});

vi.mock('@medplum/dosespot-react', async (importOriginal) => {
  const actual = await importOriginal<typeof DoseSpotReactModule>();
  return {
    ...actual,
    useDoseSpotPharmacySearch: vi.fn(),
  };
});

describe('DoseSpotPharmacyDialog', () => {
  const searchPharmacies = vi.fn();
  const addToFavorites = vi.fn();
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    lastPharmacyDialogProps = undefined;
    searchPharmacies.mockResolvedValue([]);
    addToFavorites.mockResolvedValue({});
    vi.mocked(useDoseSpotPharmacySearch).mockReturnValue({ searchPharmacies, addToFavorites });
  });

  function setup(): ReturnType<typeof render> {
    const medplum = new MockClient();
    return render(
      <MedplumProvider medplum={medplum}>
        <DoseSpotPharmacyDialog patient={HomerSimpson} onSubmit={onSubmit} onClose={onClose} />
      </MedplumProvider>
    );
  }

  test('Renders the generic pharmacy dialog', () => {
    setup();
    expect(screen.getByTestId('pharmacy-dialog')).toBeInTheDocument();
  });

  test('Forwards the base props through to PharmacyDialog', () => {
    setup();

    expect(lastPharmacyDialogProps?.patient).toBe(HomerSimpson);
    expect(lastPharmacyDialogProps?.onSubmit).toBe(onSubmit);
    expect(lastPharmacyDialogProps?.onClose).toBe(onClose);
  });

  test('Wires DoseSpot search into onSearch', async () => {
    const results: Organization[] = [{ resourceType: 'Organization', id: 'pharmacy-1' }];
    searchPharmacies.mockResolvedValue(results);
    setup();

    await expect(lastPharmacyDialogProps?.onSearch({ zip: '19720' })).resolves.toBe(results);
    expect(searchPharmacies).toHaveBeenCalledWith({ zip: '19720' });
  });

  test('Wires DoseSpot add-to-favorites into onAddToFavorites', async () => {
    const response = { success: true, message: 'Added' };
    addToFavorites.mockResolvedValue(response);
    setup();

    const params = {
      patientId: HomerSimpson.id as string,
      pharmacy: { resourceType: 'Organization', id: 'pharmacy-1' } as Organization,
      setAsPrimary: true,
    };
    await expect(lastPharmacyDialogProps?.onAddToFavorites(params)).resolves.toEqual(response);
    expect(addToFavorites).toHaveBeenCalledWith(params);
  });
});
