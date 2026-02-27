// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Loader, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatAddress, getReferenceString, OperationOutcomeError } from '@medplum/core';
import type { Organization, Patient } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { ComponentType, JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { LoadState } from '../utils/loadState';
import { CollapsibleSection } from './CollapsibleSection';
import { getPreferredPharmaciesFromPatient } from './pharmacy-utils';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

/**
 * Base props that any pharmacy dialog component must accept.
 */
export interface PharmacyDialogBaseProps {
  readonly patient: Patient;
  readonly onSubmit: (pharmacy: Organization) => void;
  readonly onClose: () => void;
}

export interface PharmaciesProps {
  readonly patient: Patient;
  readonly pharmacies?: Organization[];
  readonly onClickResource?: (resource: Organization) => void;
  readonly pharmacyDialogComponent?: ComponentType<PharmacyDialogBaseProps>;
}

interface PharmacyWithPrimary extends Organization {
  isPrimary?: boolean;
}

export function Pharmacies(props: PharmaciesProps): JSX.Element {
  const { patient: patientProp, onClickResource, pharmacyDialogComponent } = props;
  const PharmacyDialogComponent = pharmacyDialogComponent;
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [resolvedPharmacies, setResolvedPharmacies] = useState<PharmacyWithPrimary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  // Use useResource to get the latest patient data (in case it's updated)
  const patient = useResource(patientProp);

  // Extract pharmacy references from Patient extensions
  const pharmacyRefs = useMemo(() => {
    if (!patient) {
      return [];
    }
    return getPreferredPharmaciesFromPatient(patient);
  }, [patient]);

  // Resolve Organization references
  useEffect(() => {
    let cancelled = false;

    const fetchPharmacies = async (): Promise<void> => {
      if (props.pharmacies) {
        // If pharmacies were provided as props, use them directly
        if (!cancelled) {
          setResolvedPharmacies(props.pharmacies as PharmacyWithPrimary[]);
          setLoadState('loaded');
        }
        return;
      }

      if (pharmacyRefs.length === 0) {
        if (!cancelled) {
          setResolvedPharmacies([]);
          setLoadState('loaded');
        }
        return;
      }

      setLoadState('loading');

      try {
        const results = await Promise.all(
          pharmacyRefs.map(async (pharmacyRef) => {
            try {
              const org = await medplum.readReference(pharmacyRef.organizationRef);
              return { ...org, isPrimary: pharmacyRef.isPrimary } as PharmacyWithPrimary;
            } catch (error) {
              if (!isNotFoundError(error)) {
                // Error logged by Medplum error handler
              }
              return null;
            }
          })
        );
        if (!cancelled) {
          const validResults = results.filter((result): result is PharmacyWithPrimary => result !== null);
          setResolvedPharmacies(validResults);
          // If all references failed to resolve, show error state
          // If some resolved successfully, show loaded state with partial results
          setLoadState(validResults.length === 0 && pharmacyRefs.length > 0 ? 'error' : 'loaded');
        }
      } catch (_error) {
        // Promise.all error indicates a critical failure
        // Set error state to show failure message to user
        // The specific error is not critical since UI properly handles all error states
        if (!cancelled) {
          setLoadState('error');
        }
        // Note: Not re-throwing as error is already handled via UI state
      }
    };

    fetchPharmacies().catch(() => {
      // Error is handled in the component's error state
    });

    return () => {
      cancelled = true;
    };
  }, [medplum, pharmacyRefs, props.pharmacies]);

  const handleSubmit = useCallback(
    async (_pharmacy: Organization) => {
      // After adding a pharmacy, the patient extension is updated by the bot
      // Invalidate only the patient resource to trigger a refresh
      if (patient?.id) {
        medplum.invalidateUrl(getReferenceString(patient));
      }
      close();
    },
    [medplum, patient, close]
  );

  if (!patient) {
    return <></>;
  }

  const renderPharmacyList = (): JSX.Element => {
    if (loadState === 'loading') {
      return <Loader size="sm" />;
    }
    if (loadState === 'error') {
      return (
        <Text c="red" size="sm">
          Failed to load pharmacies
        </Text>
      );
    }
    if (resolvedPharmacies.length === 0) {
      return <Text>(none)</Text>;
    }
    return (
      <Box>
        <Flex direction="column" gap={8}>
          {resolvedPharmacies.map((pharmacy, index) => (
            <SummaryItem key={pharmacy.id || index} onClick={() => onClickResource?.(pharmacy)}>
              <Box>
                <Text fw={500} className={styles.itemText}>
                  {pharmacy.name}
                </Text>
                <Group mt={2} gap={4}>
                  {pharmacy.isPrimary && <StatusBadge color="blue" variant="light" status="primary" />}
                  {pharmacy.address?.[0] && (
                    <Text size="xs" c="dimmed">
                      {formatAddress(pharmacy.address[0])}
                    </Text>
                  )}
                </Group>
              </Box>
            </SummaryItem>
          ))}
        </Flex>
      </Box>
    );
  };

  return (
    <>
      <CollapsibleSection title="Pharmacies" onAdd={pharmacyDialogComponent ? open : undefined}>
        {renderPharmacyList()}
      </CollapsibleSection>
      {PharmacyDialogComponent ? (
        <Modal opened={opened} onClose={close} title="Add Pharmacy" size="lg">
          <PharmacyDialogComponent patient={patient} onSubmit={handleSubmit} onClose={close} />
        </Modal>
      ) : null}
    </>
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof OperationOutcomeError)) {
    return false;
  }

  return (
    error.outcome.issue?.some((issue: unknown) => (issue as Record<string, unknown>).code === 'not-found') ?? false
  );
}
