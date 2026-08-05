// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import type * as MedplumReactModule from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { useScriptSurePharmacySearch } from '@medplum/scriptsure-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScriptSurePharmacyDialog } from './ScriptSurePharmacyDialog';

type PharmacyDialogProps = MedplumReactModule.PharmacyDialogProps;

let lastPharmacyDialogProps: PharmacyDialogProps | undefined;

vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MedplumReactModule>();
  return {
    ...actual,
    PharmacyDialog: (props: PharmacyDialogProps): JSX.Element => {
      lastPharmacyDialogProps = props;
      return (
        <div>
          {props.renderBeforeSearchButton}
          <button
            type="button"
            onClick={() => {
              props.onSearch({ zip: '19720', ...(props.getExtraSearchParams?.() ?? {}) }).catch(() => undefined);
            }}
          >
            Search
          </button>
        </div>
      );
    },
  };
});

vi.mock('@medplum/scriptsure-react', async (importOriginal) => {
  const actual = await importOriginal<typeof ScriptSureReactModule>();
  return {
    ...actual,
    useScriptSurePharmacySearch: vi.fn(),
  };
});

describe('ScriptSurePharmacyDialog', () => {
  const searchPharmacies = vi.fn();
  const addToFavorites = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    lastPharmacyDialogProps = undefined;
    searchPharmacies.mockResolvedValue([]);
    vi.mocked(useScriptSurePharmacySearch).mockReturnValue({ searchPharmacies, addToFavorites });
  });

  function setup(): ReturnType<typeof render> {
    const medplum = new MockClient();
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          <ScriptSurePharmacyDialog patient={HomerSimpson} onSubmit={vi.fn()} onClose={vi.fn()} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  test('Renders pharmacy category filters with Retail selected by default', () => {
    setup();

    expect(screen.getByText('Pharmacy categories')).toBeInTheDocument();
    expect(screen.getByLabelText('Retail')).toBeChecked();
    expect(screen.getByLabelText('Mail order')).not.toBeChecked();
    expect(lastPharmacyDialogProps?.getExtraSearchParams?.()).toEqual({ specialties: ['Retail'] });
  });

  test('Passes default Retail specialty with zip search', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(searchPharmacies).toHaveBeenCalledWith({
        zip: '19720',
        specialties: ['Retail'],
      });
    });
  });

  test('Includes additional selected specialties in search', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Mail order'));
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(searchPharmacies).toHaveBeenCalledWith({
        zip: '19720',
        specialties: expect.arrayContaining(['Retail', 'MailOrder']),
      });
    });
  });

  test('Omits specialties key when no category is selected', async () => {
    setup();

    // Deselect the default Retail category, leaving no categories selected
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Retail'));
    });

    expect(screen.getByLabelText('Retail')).not.toBeChecked();
    expect(lastPharmacyDialogProps?.getExtraSearchParams?.()).toEqual({});

    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
    });

    await waitFor(() => {
      expect(searchPharmacies).toHaveBeenCalledWith({ zip: '19720' });
    });
  });
});
