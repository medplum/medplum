import { Badge, Button, Group, Paper, ScrollArea, Tabs, Title, useMantineTheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, isGone, normalizeErrorString } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType, ServiceRequest } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { PatientHeader } from '../components/PatientHeader';
import { QuickServiceRequests } from '../components/QuickServiceRequests';
import { QuickStatus } from '../components/QuickStatus';
import { ResourceHeader } from '../components/ResourceHeader';
import { SpecimenHeader } from '../components/SpecimenHeader';
import { getPatient, getSpecimen } from '../utils';
import { cleanResource } from './utils';

function getTabs(resourceType: string): string[] {
  const result = ['Timeline'];

  if (resourceType === 'Bot') {
    result.push('Editor', 'Subscriptions');
  }

  if (resourceType === 'PlanDefinition') {
    result.push('Apply', 'Builder');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder', 'Bots', 'Responses');
  }

  if (resourceType === 'DiagnosticReport' || resourceType === 'MeasureReport') {
    result.push('Report');
  }

  if (resourceType === 'RequestGroup') {
    result.push('Checklist');
  }

  if (resourceType === 'ObservationDefinition') {
    result.push('Ranges');
  }

  if (resourceType === 'Agent') {
    result.push('Tools');
  }

  result.push('Details', 'Edit', 'Event', 'History', 'Blame', 'JSON', 'Apps', 'Profiles');
  return result;
}

const BETA_TABS = ['Profiles'];

export function ResourcePage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const value = useResource(reference, setOutcome);
  const tabs = getTabs(resourceType);
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });
  const theme = useMantineTheme();

  async function restoreResource(): Promise<void> {
    const historyBundle = await medplum.readHistory(resourceType, id);
    const restoredResource = historyBundle.entry?.find((e) => !!e.resource)?.resource;
    if (restoredResource) {
      onSubmit(restoredResource);
    } else {
      showNotification({ color: 'red', message: 'No history to restore', autoClose: false });
    }
  }

  function onSubmit(newResource: Resource): void {
    medplum
      .updateResource(cleanResource(newResource))
      .then(() => {
        setOutcome(undefined);
        showNotification({ color: 'green', message: 'Success' });
      })
      .catch((err) => {
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  }

  if (outcome) {
    if (isGone(outcome)) {
      return (
        <Document>
          <Title>Deleted</Title>
          <p>The resource was deleted.</p>
          <Button color="red" onClick={restoreResource}>
            Restore
          </Button>
        </Document>
      );
    }
    return <OperationOutcomeAlert outcome={outcome} />;
  }

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0].toLowerCase();
    }
    setCurrentTab(newTabName);
    navigate(`/${resourceType}/${id}/${newTabName}`);
  }

  function onStatusChange(status: string): void {
    const serviceRequest = value as ServiceRequest;
    const orderDetail = serviceRequest.orderDetail || [];
    if (orderDetail.length === 0) {
      orderDetail.push({});
    }
    if (orderDetail[0].text !== status) {
      orderDetail[0].text = status;
      onSubmit({ ...serviceRequest, orderDetail });
    }
  }

  const patient = value && getPatient(value);
  const specimen = value && getSpecimen(value);
  const statusValueSet = medplum.getUserConfiguration()?.option?.find((o) => o.id === 'statusValueSet')?.valueString;

  return (
    <>
      {value?.resourceType === 'ServiceRequest' && statusValueSet && (
        <QuickStatus
          key={getReferenceString(value) + '-' + value.orderDetail?.[0]?.text}
          valueSet={{ reference: statusValueSet }}
          defaultValue={value.orderDetail?.[0]?.text}
          onChange={onStatusChange}
        />
      )}
      {value && <QuickServiceRequests value={value} />}
      {value && (
        <Paper>
          {patient && <PatientHeader patient={patient} />}
          {specimen && <SpecimenHeader specimen={specimen} />}
          {resourceType !== 'Patient' && <ResourceHeader resource={reference} />}
          <ScrollArea>
            <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
              <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
                {tabs.map((t) => (
                  <Tabs.Tab key={t} value={t.toLowerCase()}>
                    {BETA_TABS.includes(t) ? (
                      <Group gap="xs" wrap="nowrap">
                        {t}
                        <Badge color={theme.primaryColor} size="sm">
                          Beta
                        </Badge>
                      </Group>
                    ) : (
                      t
                    )}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </ScrollArea>
        </Paper>
      )}
      <Outlet />
    </>
  );
}
