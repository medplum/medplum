import { normalizeErrorString, resolveId } from '@medplum/core';
import {
  Bot,
  Bundle,
  DiagnosticReport,
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
  Loading,
  MedplumLink,
  PatientTimeline,
  PlanDefinitionBuilder,
  QuestionnaireBuilder,
  QuestionnaireForm,
  RequestGroupDisplay,
  ResourceBlame,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  ServiceRequestTimeline,
  Tab,
  TabList,
  TabPanel,
  TabSwitch,
  useMedplum,
} from '@medplum/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PatientHeader } from '../components/PatientHeader';
import { QuickServiceRequests } from '../components/QuickServiceRequests';
import { QuickStatus } from '../components/QuickStatus';
import { ResourceHeader } from '../components/ResourceHeader';
import { SpecimenHeader } from '../components/SpecimenHeader';
import { getPatient, getSpecimen } from '../utils';
import { AppsPage } from './AppsPage';
import { BotEditor } from './BotEditor';
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
    result.push('Preview', 'Builder');
  }

  if (resourceType === 'DiagnosticReport') {
    result.push('Report');
  }

  if (resourceType === 'RequestGroup') {
    result.push('Checklist');
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
          setError(responseBundle.entry?.[0]?.response as OperationOutcome);
        } else {
          setValue(responseBundle.entry?.[0]?.resource);
          setHistoryBundle(responseBundle.entry?.[1]?.resource as Bundle);
        }
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
   * @param button Which mouse button was used to change the tab.
   */
  function onTabChange(newTabName: string, button: number): void {
    const url = `/${resourceType}/${id}/${newTabName}`;
    if (button === 1) {
      // "Aux Click" / middle click
      // Open in new tab or new window
      window.open(url, '_blank');
    } else {
      // Otherwise, by default, navigate to the new tab
      navigate(url);
    }
  }

  function onSubmit(newResource: Resource): void {
    medplum
      .updateResource(cleanResource(newResource))
      .then(loadResource)
      .then(() => toast.success('Success'))
      .catch((err) => toast.error(normalizeErrorString(err)));
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

  if (!value || !historyBundle) {
    return (
      <Document>
        <h1>Resource not found</h1>
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
      {patient && <PatientHeader patient={patient} />}
      {specimen && <SpecimenHeader specimen={specimen} />}
      {resourceType !== 'Patient' && <ResourceHeader resource={value} />}
      <TabList value={currentTab} onChange={onTabChange}>
        {tabs.map((t) => (
          <Tab key={t} name={t.toLowerCase()} label={t} />
        ))}
      </TabList>
      {currentTab === 'editor' && (
        <ErrorBoundary>
          <BotEditor bot={value as Bot} />
        </ErrorBoundary>
      )}
      {currentTab !== 'editor' && (
        <Document>
          {error && <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>}
          <TabSwitch value={currentTab}>
            <TabPanel name={currentTab}>
              <ErrorBoundary>
                <ResourceTab
                  name={currentTab.toLowerCase()}
                  resource={value}
                  resourceHistory={historyBundle}
                  onSubmit={onSubmit}
                  outcome={error}
                />
              </ErrorBoundary>
            </TabPanel>
          </TabSwitch>
        </Document>
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
      return <ResourceTable value={props.resource} />;
    case 'edit':
      return (
        <ResourceForm
          defaultValue={props.resource}
          onSubmit={props.onSubmit}
          onDelete={() => navigate(`/${resourceType}/${id}/delete`)}
          outcome={props.outcome}
        />
      );
    case 'delete':
      return <DeletePage resourceType={resourceType} id={id as string} />;
    case 'history':
      return <ResourceHistoryTable history={props.resourceHistory} />;
    case 'blame':
      return <ResourceBlame history={props.resourceHistory} />;
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
        return <PlanDefinitionBuilder value={props.resource as PlanDefinition} onSubmit={props.onSubmit} />;
      } else {
        return <QuestionnaireBuilder questionnaire={props.resource as Questionnaire} onSubmit={props.onSubmit} />;
      }
    case 'preview':
      return (
        <>
          <p className="medplum-alert">
            This is just a preview! Access your form here:
            <br />
            <a href={`/forms/${props.resource.id}`}>{`/forms/${props.resource.id}`}</a>
          </p>
          <QuestionnaireForm
            questionnaire={props.resource as Questionnaire}
            onSubmit={() => alert('You submitted the preview')}
          />
        </>
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
