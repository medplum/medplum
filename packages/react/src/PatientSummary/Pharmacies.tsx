// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Loader, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatAddress } from '@medplum/core';
import { getPreferredPharmaciesFromPatient } from '@medplum/dosespot-react';
import type { Organization, Patient } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import { PharmacyDialog } from './PharmacyDialog';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface PharmaciesProps {
  readonly patient: Patient;
  readonly pharmacies?: Organization[];
  readonly onClickResource?: (resource: Organization) => void;
}

interface PharmacyWithPrimary extends Organization {
  isPrimary?: boolean;
}

export function Pharmacies(props: PharmaciesProps): JSX.Element {
  const { patient: patientProp, onClickResource } = props;
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [resolvedPharmacies, setResolvedPharmacies] = useState<PharmacyWithPrimary[]>([]);
  const [loading, setLoading] = useState(true);

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
          setLoading(false);
        }
        return;
      }

      if (pharmacyRefs.length === 0) {
        if (!cancelled) {
          setResolvedPharmacies([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const results = await Promise.all(
          pharmacyRefs.map(async (ref) => {
            try {
              const org = await medplum.readReference(ref.organizationRef);
              return { ...org, isPrimary: ref.isPrimary } as PharmacyWithPrimary;
            } catch (error) {
              console.error('Error resolving pharmacy reference:', error);
              return null;
            }
          })
        );
        if (!cancelled) {
          setResolvedPharmacies(results.filter((r): r is PharmacyWithPrimary => r !== null));
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error resolving pharmacies:', error);
          setLoading(false);
        }
      }
    };

    fetchPharmacies().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [medplum, pharmacyRefs, props.pharmacies]);

  const handleSubmit = useCallback(
    async (_pharmacy: Organization) => {
      // After adding a pharmacy, the patient extension is updated by the bot
      // Force a refresh to get the updated patient
      await medplum.invalidateAll();
      close();
    },
    [medplum, close]
  );

  if (!patient) {
    return <></>;
  }

  const renderPharmacyList = (): JSX.Element => {
    if (loading) {
      return <Loader size="sm" />;
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
      <CollapsibleSection title="Pharmacies" onAdd={open}>
        {renderPharmacyList()}
      </CollapsibleSection>
      <Modal opened={opened} onClose={close} title="Add Pharmacy" size="lg">
        <PharmacyDialog patient={patient} onSubmit={handleSubmit} onClose={close} />
      </Modal>
    </>
  );
}
