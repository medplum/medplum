// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Loader, Paper, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, normalizeErrorString, parseSearchRequest } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
} from '@medplum/dosespot-react';
import { Loading, SearchControl, useMedplum } from '@medplum/react';
import { IconSwitchHorizontal } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { hasDoseSpotIdentifier } from '../../components/utils';
import { usePatient } from '../../hooks/usePatient';
import { prependPatientPath } from './PatientPage.utils';

export function MedicationsPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState<SearchRequest>();
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const membership = medplum.getProjectMembership();
  const hasDoseSpot = hasDoseSpotIdentifier(membership);

  const handleDoseSpotSync = useCallback(async () => {
    if (!patient?.id) {
      return;
    }

    setSyncing(true);
    // Note: DoseSpot API only returns results when start date equals today
    const today = new Date().toISOString().split('T')[0];

    try {
      // First sync patient data (including meds) from Medplum to DoseSpot
      await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId: patient.id });

      // Then sync prescriptions and medication history from DoseSpot to Medplum in parallel
      await Promise.all([
        medplum.executeBot(DOSESPOT_PRESCRIPTIONS_SYNC_BOT, {
          patientId: patient.id,
          start: today,
          end: today,
        }),
        medplum.executeBot(DOSESPOT_MEDICATION_HISTORY_BOT, {
          patientId: patient.id,
          start: today,
          end: today,
        }),
      ]);

      showNotification({
        color: 'green',
        icon: '✓',
        title: 'Successfully synced prescriptions and medications with DoseSpot',
        message: '',
      });

      // Invalidate cache and refresh the search results to show newly synced data
      medplum.invalidateSearches('MedicationRequest');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showNotification({
        color: 'red',
        title: 'Error syncing with DoseSpot',
        message: normalizeErrorString(err),
      });
    } finally {
      setSyncing(false);
    }
  }, [medplum, patient]);

  useEffect(() => {
    if (!patient) {
      return;
    }

    const parsedSearch = parseSearchRequest(location.pathname + location.search);
    const populatedSearch = addDefaultSearchValues(parsedSearch);

    if (
      location.pathname === `/Patient/${patient.id}/MedicationRequest` &&
      location.search === formatSearchQuery(populatedSearch)
    ) {
      setSearch(populatedSearch);
    } else {
      navigate(`/Patient/${patient.id}/MedicationRequest${formatSearchQuery(populatedSearch)}`)?.catch(console.error);
    }
  }, [medplum, patient, navigate, location]);

  if (!patient || !search?.resourceType || !search.fields || search.fields.length === 0) {
    return <Loading />;
  }

  return (
    <Paper shadow="xs" m="md" p="xs">
      {hasDoseSpot && (
        <Group justify="flex-end" mb="md">
          <Tooltip
            label="Imports and updates completed and active prescriptions as well as medication history"
            multiline
            position="left-start"
            offset={8}
            openDelay={1000}
            w={300}
            disabled={syncing}
          >
            <Button
              size="sm"
              leftSection={
                syncing ? <Loader size={16} color="gray" opacity={0.5} /> : <IconSwitchHorizontal size={16} />
              }
              disabled={syncing}
              onClick={handleDoseSpotSync}
              variant="light"
              miw={200}
            >
              {syncing ? 'Syncing…' : 'Sync with DoseSpot'}
            </Button>
          </Tooltip>
        </Group>
      )}
      <SearchControl
        key={refreshKey}
        checkboxesEnabled={true}
        search={search}
        onClick={(e) =>
          navigate(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)
        }
        onAuxClick={(e) => window.open(`/Patient/${patient.id}/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
        onNew={() => {
          navigate(prependPatientPath(patient, '/MedicationRequest/new'))?.catch(console.error);
        }}
        onChange={(e) => {
          navigate(`/Patient/${patient.id}/MedicationRequest${formatSearchQuery(e.definition)}`)?.catch(console.error);
        }}
      />
    </Paper>
  );
}

function addDefaultSearchValues(search: SearchRequest): SearchRequest {
  const fields = search.fields ?? ['_id', '_lastUpdated'];
  const offset = search.offset ?? 0;
  const count = search.count ?? DEFAULT_SEARCH_COUNT;
  return {
    ...search,
    fields,
    offset,
    count,
  };
}
