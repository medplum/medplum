// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Checkbox, Flex, Group, Loader, Radio, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatAddress, normalizeErrorString } from '@medplum/core';
import type { Organization, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { DOSESPOT_ADD_PATIENT_PHARMACY_BOT, DOSESPOT_SEARCH_PHARMACY_BOT } from './pharmacy-utils';

export interface PharmacyDialogProps {
  readonly patient: Patient;
  readonly onSubmit: (pharmacy: Organization) => void;
  readonly onClose: () => void;
}

interface AddPharmacyResponse {
  success: boolean;
  message: string;
  organization?: Organization;
}

/**
 * Type guard to validate that the bot response is an array of Organization resources.
 */
function isOrganizationArray(value: unknown): value is Organization[] {
  if (!Array.isArray(value)) {
    return false;
  }
  // Check first item if array is non-empty
  if (value.length > 0) {
    const first = value[0];
    return typeof first === 'object' && first !== null && first.resourceType === 'Organization';
  }
  return true; // Empty array is valid
}

/**
 * Type guard to validate the add pharmacy bot response.
 */
function isAddPharmacyResponse(value: unknown): value is AddPharmacyResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.success === 'boolean' && typeof obj.message === 'string';
}

/**
 * Gets a unique key for a pharmacy based on its identifier or index.
 */
function getPharmacyKey(pharmacy: Organization, index: number): string {
  return pharmacy.identifier?.[0]?.value || `pharmacy-${index}`;
}

export function PharmacyDialog(props: PharmacyDialogProps): JSX.Element {
  const { patient, onSubmit, onClose } = props;
  const medplum = useMedplum();

  const [searchResults, setSearchResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Organization | undefined>();
  const [setAsPrimary, setSetAsPrimary] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleSearch = useCallback(
    async (formData: FormData) => {
      const searchParams = {
        name: formData.get('name') as string | undefined,
        city: formData.get('city') as string | undefined,
        state: formData.get('state') as string | undefined,
        zip: formData.get('zip') as string | undefined,
        address: formData.get('address') as string | undefined,
        phoneOrFax: formData.get('phoneOrFax') as string | undefined,
        ncpdpID: formData.get('ncpdpID') as string | undefined,
      };

      // Remove empty values
      const cleanParams = Object.fromEntries(Object.entries(searchParams).filter(([_, v]) => v && v.trim() !== ''));

      if (Object.keys(cleanParams).length === 0) {
        showNotification({
          color: 'yellow',
          title: 'Search Required',
          message: 'Please enter at least one search criterion',
        });
        return;
      }

      setSearching(true);
      setSelectedPharmacy(undefined);
      try {
        const response = await medplum.executeBot(DOSESPOT_SEARCH_PHARMACY_BOT, cleanParams);

        // Validate the response is an array of Organizations
        if (!isOrganizationArray(response)) {
          throw new Error('Invalid response from pharmacy search');
        }

        setSearchResults(response);
        if (response.length === 0) {
          showNotification({
            color: 'blue',
            title: 'No Results',
            message: 'No pharmacies found matching your search criteria',
          });
        }
      } catch (error) {
        console.error('Error searching pharmacies:', error);
        showNotification({
          color: 'red',
          title: 'Search Error',
          message: normalizeErrorString(error),
        });
      } finally {
        setSearching(false);
      }
    },
    [medplum]
  );

  const handleAddFavorite = useCallback(async () => {
    if (!selectedPharmacy || !patient.id) {
      return;
    }

    setAdding(true);
    try {
      // Pass the full Organization to the bot instead of just the pharmacy ID
      const response = await medplum.executeBot(DOSESPOT_ADD_PATIENT_PHARMACY_BOT, {
        patientId: patient.id,
        pharmacy: selectedPharmacy,
        setAsPrimary,
      });

      // Validate the response structure
      if (!isAddPharmacyResponse(response)) {
        throw new Error('Invalid response from add pharmacy bot');
      }

      if (response.success) {
        showNotification({
          color: 'green',
          title: 'Success',
          message: response.message,
        });
        // Return the persisted Organization if available, otherwise the selected one
        onSubmit(response.organization || selectedPharmacy);
      } else {
        showNotification({
          color: 'red',
          title: 'Error',
          message: response.message,
        });
      }
    } catch (error) {
      console.error('Error adding pharmacy:', error);
      showNotification({
        color: 'red',
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setAdding(false);
    }
  }, [selectedPharmacy, patient.id, setAsPrimary, medplum, onSubmit]);

  return (
    <Box>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          handleSearch(formData).catch(console.error);
        }}
      >
        <Stack gap="md">
          <TextInput name="name" label="Pharmacy Name" placeholder="Enter pharmacy name (min 3 chars)" />
          <Group grow>
            <TextInput name="city" label="City" placeholder="City (min 3 chars)" />
            <TextInput name="state" label="State" placeholder="State (min 3 chars)" />
          </Group>
          <Group grow>
            <TextInput name="zip" label="Zip Code" placeholder="Zip code (min 3 chars)" />
            <TextInput name="phoneOrFax" label="Phone or Fax" placeholder="Phone or fax number" />
          </Group>
          <TextInput name="address" label="Address" placeholder="Street address (min 3 chars)" />
          <TextInput name="ncpdpID" label="NCPDP ID" placeholder="National Council for Prescription Drug Programs ID" />

          <Button type="submit" loading={searching}>
            Search
          </Button>
        </Stack>
      </form>

      {searching && (
        <Flex justify="center" mt="xl">
          <Loader />
        </Flex>
      )}

      {searchResults.length > 0 && !searching && (
        <Box mt="xl">
          <Text fw={600} mb="md">
            Search Results ({searchResults.length})
          </Text>
          <Radio.Group
            value={selectedPharmacy ? getPharmacyKey(selectedPharmacy, searchResults.indexOf(selectedPharmacy)) : ''}
            onChange={(value) => {
              const selected = searchResults.find((p, i) => getPharmacyKey(p, i) === value);
              setSelectedPharmacy(selected);
            }}
          >
            <Stack gap="sm">
              {searchResults.map((pharmacy, index) => {
                const pharmacyKey = getPharmacyKey(pharmacy, index);
                const isSelected = selectedPharmacy
                  ? getPharmacyKey(selectedPharmacy, searchResults.indexOf(selectedPharmacy)) === pharmacyKey
                  : false;

                return (
                  <Box
                    key={pharmacyKey}
                    p="sm"
                    style={{
                      border: isSelected
                        ? '2px solid var(--mantine-color-blue-6)'
                        : '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedPharmacy(pharmacy)}
                  >
                    <Radio
                      value={pharmacyKey}
                      label={
                        <Box>
                          <Text fw={500} size="sm">
                            {pharmacy.name}
                          </Text>
                          {pharmacy.address?.[0] && (
                            <Text size="xs" c="dimmed">
                              {formatAddress(pharmacy.address[0])}
                            </Text>
                          )}
                          {pharmacy.telecom?.find((t) => t.system === 'phone') && (
                            <Text size="xs" c="dimmed">
                              Phone: {pharmacy.telecom.find((t) => t.system === 'phone')?.value}
                            </Text>
                          )}
                          {pharmacy.telecom?.find((t) => t.system === 'fax') && (
                            <Text size="xs" c="dimmed">
                              Fax: {pharmacy.telecom.find((t) => t.system === 'fax')?.value}
                            </Text>
                          )}
                        </Box>
                      }
                    />
                  </Box>
                );
              })}
            </Stack>
          </Radio.Group>

          <Flex mt="lg" gap="md" align="center" justify="space-between">
            <Checkbox
              label="Set as primary pharmacy"
              checked={setAsPrimary}
              onChange={(e) => setSetAsPrimary(e.currentTarget.checked)}
            />
            <Group>
              <Button variant="subtle" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleAddFavorite} disabled={!selectedPharmacy} loading={adding}>
                Add to Favorites
              </Button>
            </Group>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
