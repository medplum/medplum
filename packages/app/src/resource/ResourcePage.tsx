import { Alert, Anchor, Button, Paper, ScrollArea, Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { isGone, normalizeErrorString, resolveId } from '@medplum/core';
import {
  Bot,
  Bundle,
  DiagnosticReport,
  ObservationDefinition,
  OperationOutcome,
  PlanDefinition,
  Questionnaire,
  RequestGroup,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import {
  DefaultResourceTimeline,
  DiagnosticReportDisplay,
  Document,
  EncounterTimeline,
  ErrorBoundary,
  MedplumLink,
  PatientTimeline,
  PlanDefinitionBuilder,
  QuestionnaireBuilder,
  QuestionnaireForm,
  RequestGroupDisplay,
  ReferenceRangeEditor,
  ResourceBlame,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  ServiceRequestTimeline,
  useMedplum,
} from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loading } from '../components/Loading';
import { PatientHeader } from '../components/PatientHeader';
import { QuickServiceRequests } from '../components/QuickServiceRequests';
import { QuickStatus } from '../components/QuickStatus';
import { ResourceHeader } from '../components/ResourceHeader';
import { SpecimenHeader } from '../components/SpecimenHeader';
import { getPatient, getSpecimen } from '../utils';
import { AppsPage } from './AppsPage';
import { BotEditor } from './BotEditor';
import { BotsPage } from './BotsPage';
import { DeletePage } from './DeletePage';
import { JsonPage } from './JsonPage';
import { PlanDefinitionApplyForm } from './PlanDefinitionApplyForm';

function getTabs(resourceType: string): string[] {
  const result = ['Timeline'];

  if (resourceType === 'Bot') {
    result.push('Editor');
  }

  if (resourceType === 'PlanDefinition') {
    result.push('Apply', 'Builder');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder', 'Bots');
  }

  if (resourceType === 'DiagnosticReport') {
    result.push('Report');
  }

  if (resourceType === 'RequestGroup') {
    result.push('Checklist');
  }

  if (resourceType === 'ObservationDefinition') {
    result.push('Ranges');
  }

  result.push('Details', 'Edit', 'History', 'Blame', 'JSON', 'Apps');
  return result;
}

export function ResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType, id, tab } = useParams() as {
    resourceType: string;
    id: string;
    tab: string;
  };
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [value, setValue] = useState<Resource | undefined>();
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState<OperationOutcome | undefined>();

  const loadResource = useCallback(() => {
    setError(undefined);
    setLoading(true);

    // Build a batch request
    // 1) Read the resource
    // 2) Read the history
    const requestBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: `${resourceType}/${id}`,
          },
        },
        {
          request: {
            method: 'GET',
            url: `${resourceType}/${id}/_history`,
          },
        },
      ],
    };

    medplum
      .executeBatch(requestBundle)
      .then((responseBundle: Bundle) => {
        if (responseBundle.entry?.[0]?.response?.status !== '200') {
          setError(responseBundle.entry?.[0]?.response?.outcome as OperationOutcome);
        } else {
          setValue(responseBundle.entry?.[0]?.resource);
        }
        setHistoryBundle(responseBundle.entry?.[1]?.resource as Bundle);
        setLoading(false);
      })
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }, [medplum, resourceType, id]);

  /**
   * Handles a tab change event.
   * @param newTabName The new tab name.
   */
  function onTabChange(newTabName: string): void {
    navigate(`/${resourceType}/${id}/${newTabName}`);
  }

  function onSubmit(newResource: Resource): void {
    medplum
      .updateResource(cleanResource(newResource))
      .then(loadResource)
      .then(() => showNotification({ color: 'green', message: 'Success' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  function restoreResource(): void {
    const restoredResource = historyBundle?.entry?.find((e) => !!e.resource)?.resource;
    if (restoredResource) {
      onSubmit(restoredResource);
    } else {
      showNotification({ color: 'red', message: 'No history to restore' });
    }
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

  useEffect(() => {
    loadResource();
  }, [loadResource]);

  if (loading) {
    return <Loading />;
  }

  if (error && isGone(error)) {
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

  if (!value || !historyBundle) {
    return (
      <Document>
        <Title>Resource not found</Title>
        <MedplumLink to={`/${resourceType}`}>Return to search page</MedplumLink>
      </Document>
    );
  }

  const tabs = getTabs(resourceType);
  const defaultTab = tabs[0].toLowerCase();
  const currentTab = tab || defaultTab;
  const patient = getPatient(value);
  const specimen = getSpecimen(value);
  const statusValueSet = medplum.getUserConfiguration()?.option?.find((o) => o.id === 'statusValueSet')?.valueString;
  return (
    <>
      {value?.resourceType === 'ServiceRequest' && statusValueSet && (
        <QuickStatus
          valueSet={{ reference: statusValueSet }}
          defaultValue={(value as ServiceRequest | undefined)?.orderDetail?.[0]?.text}
          onChange={onStatusChange}
        />
      )}
      <QuickServiceRequests value={value} />
      <Paper>
        {patient && <PatientHeader patient={patient} />}
        {specimen && <SpecimenHeader specimen={specimen} />}
        {resourceType !== 'Patient' && <ResourceHeader resource={value} />}
        <ScrollArea>
          <Tabs value={currentTab.toLowerCase()} onTabChange={onTabChange}>
            <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
              {tabs.map((t) => (
                <Tabs.Tab key={t} value={t.toLowerCase()}>
                  {t}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </ScrollArea>
      </Paper>
      {currentTab === 'editor' && (
        <ErrorBoundary>
          <BotEditor bot={value as Bot} />
        </ErrorBoundary>
      )}
      {currentTab !== 'editor' && (
        <>
          {error && <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>}
          <ErrorBoundary>
            <ResourceTab
              name={currentTab.toLowerCase()}
              resource={value}
              resourceHistory={historyBundle}
              onSubmit={onSubmit}
              outcome={error}
            />
          </ErrorBoundary>
        </>
      )}
    </>
  );
}

interface ResourceTabProps {
  name: string;
  resource: Resource;
  resourceHistory: Bundle;
  onSubmit: (resource: Resource) => void;
  outcome?: OperationOutcome;
}

function ResourceTab(props: ResourceTabProps): JSX.Element | null {
  const navigate = useNavigate();
  const { resourceType, id } = props.resource;
  switch (props.name) {
    case 'details':
      return (
        <Document>
          <ResourceTable value={props.resource} />
        </Document>
      );
    case 'edit':
      return (
        <Document>
          <ResourceForm
            defaultValue={props.resource}
            onSubmit={props.onSubmit}
            onDelete={() => navigate(`/${resourceType}/${id}/delete`)}
            outcome={props.outcome}
          />
        </Document>
      );
    case 'delete':
      return <DeletePage resourceType={resourceType} id={id as string} />;
    case 'history':
      return (
        <Document>
          <ResourceHistoryTable history={props.resourceHistory} />
        </Document>
      );
    case 'blame':
      return (
        <Document>
          <ResourceBlame history={props.resourceHistory} />
        </Document>
      );
    case 'json':
      return <JsonPage resource={props.resource} onSubmit={props.onSubmit} />;
    case 'apps':
      return <AppsPage resource={props.resource} />;
    case 'timeline':
      switch (props.resource.resourceType) {
        case 'Encounter':
          return <EncounterTimeline encounter={props.resource} />;
        case 'Patient':
          return <PatientTimeline patient={props.resource} />;
        case 'ServiceRequest':
          return <ServiceRequestTimeline serviceRequest={props.resource} />;
        default:
          return <DefaultResourceTimeline resource={props.resource} />;
      }
    case 'builder':
      if (props.resource.resourceType === 'PlanDefinition') {
        return (
          <Document>
            <PlanDefinitionBuilder value={props.resource as PlanDefinition} onSubmit={props.onSubmit} />
          </Document>
        );
      } else {
        return (
          <Document>
            <QuestionnaireBuilder questionnaire={props.resource as Questionnaire} onSubmit={props.onSubmit} />
          </Document>
        );
      }
    case 'preview':
      return (
        <Document>
          <Alert icon={<IconAlertCircle size={16} />} mb="xl">
            This is just a preview! Access your form here:
            <br />
            <Anchor href={`/forms/${props.resource.id}`}>{`/forms/${props.resource.id}`}</Anchor>
          </Alert>
          <QuestionnaireForm
            questionnaire={props.resource as Questionnaire}
            onSubmit={() => alert('You submitted the preview')}
          />
        </Document>
      );
    case 'report':
      return <DiagnosticReportDisplay value={props.resource as DiagnosticReport} />;
    case 'checklist':
      return (
        <RequestGroupDisplay
          value={props.resource as RequestGroup}
          onStart={(_task, taskInput) => navigate(`/forms/${resolveId(taskInput)}`)}
          onEdit={(_task, _taskInput, taskOutput) => navigate(`/${taskOutput.reference}}`)}
        />
      );
    case 'apply':
      return <PlanDefinitionApplyForm planDefinition={props.resource as PlanDefinition} />;
    case 'bots':
      return <BotsPage resource={props.resource} />;
    case 'ranges':
      return (
        <Document>
          <ReferenceRangeEditor onSubmit={props.onSubmit} definition={props.resource as ObservationDefinition} />
        </Document>
      );
  }
  return null;
}

/**
 * Cleans a resource of unwanted meta values.
 * For most users, this will not matter, because meta values are set by the server.
 * However, some administrative users are allowed to specify some meta values.
 * The admin use case is sepcial though, and unwanted here on the resource page.
 * @param resource The input resource.
 * @returns The cleaned output resource.
 */
function cleanResource(resource: Resource): Resource {
  let meta = resource.meta;
  if (meta) {
    meta = {
      ...meta,
      lastUpdated: undefined,
      versionId: undefined,
      author: undefined,
    };
  }
  return {
    ...resource,
    meta,
  };
}
