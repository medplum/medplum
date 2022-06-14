import { getReferenceString, stringify } from '@medplum/core';
import {
  Bot,
  Bundle,
  DiagnosticReport,
  OperationOutcome,
  Questionnaire,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import {
  Button,
  DefaultResourceTimeline,
  DiagnosticReportDisplay,
  Document,
  EncounterTimeline,
  ErrorBoundary,
  Form,
  Loading,
  MedplumLink,
  PatientTimeline,
  QuestionnaireBuilder,
  QuestionnaireForm,
  ResourceBlame,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  ServiceRequestTimeline,
  Tab,
  TabList,
  TabPanel,
  TabSwitch,
  TextArea,
  useMedplum,
} from '@medplum/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BotEditor } from './BotEditor';
import { PatientHeader } from './PatientHeader';
import { QuickServiceRequests } from './QuickServiceRequests';
import { QuickStatus } from './QuickStatus';
import { ResourceHeader } from './ResourceHeader';
import { SpecimenHeader } from './SpecimenHeader';
import { getPatient, getSpecimen } from './utils';

function getTabs(resourceType: string, questionnaires?: Bundle): string[] {
  const result = ['Timeline'];

  if (resourceType === 'Bot') {
    result.push('Editor');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder');
  }

  if (resourceType === 'DiagnosticReport') {
    result.push('Report');
  }

  result.push('Details', 'Edit', 'History', 'Blame', 'JSON');

  if (questionnaires?.entry && questionnaires.entry.length > 0) {
    result.push('Apps');
  }

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
  const [questionnaires, setQuestionnaires] = useState<Bundle<Questionnaire>>();
  const [error, setError] = useState<OperationOutcome | undefined>();

  const loadResource = useCallback(() => {
    setError(undefined);
    setLoading(true);

    // Build a batch request
    // 1) Read the resource
    // 2) Read the history
    // 3) Read any Questionnaires for the resource typ
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
        {
          request: {
            method: 'GET',
            url: `Questionnaire?subject-type=${resourceType}`,
          },
        },
      ],
    };

    return medplum
      .post('fhir/R4', requestBundle)
      .then((responseBundle: Bundle) => {
        if (responseBundle.entry?.[0]?.response?.status !== '200') {
          setError(responseBundle.entry?.[0]?.response as OperationOutcome);
        } else {
          setValue(responseBundle.entry?.[0]?.resource);
          setHistoryBundle(responseBundle.entry?.[1]?.resource as Bundle);
          setQuestionnaires(responseBundle.entry?.[2]?.resource as Bundle<Questionnaire>);
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
      .catch(setError);
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

  const tabs = getTabs(resourceType, questionnaires);
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
                  questionnaires={questionnaires as Bundle<Questionnaire>}
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
  questionnaires: Bundle<Questionnaire>;
  onSubmit: (resource: Resource) => void;
  outcome?: OperationOutcome;
}

function ResourceTab(props: ResourceTabProps): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
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
      return (
        <>
          <p>Are you sure you want to delete this {resourceType}?</p>
          <Button
            danger={true}
            onClick={() => {
              medplum.deleteResource(resourceType, id as string).then(() => navigate(`/${resourceType}`));
            }}
          >
            Delete
          </Button>
        </>
      );
    case 'history':
      return <ResourceHistoryTable history={props.resourceHistory} />;
    case 'blame':
      return <ResourceBlame history={props.resourceHistory} />;
    case 'json':
      return (
        <Form
          onSubmit={(formData: Record<string, string>) => {
            props.onSubmit(JSON.parse(formData.resource));
          }}
        >
          <TextArea testid="resource-json" name="resource" defaultValue={stringify(props.resource, true)} />
          <Button type="submit">OK</Button>
        </Form>
      );
    case 'apps':
      return (
        <div>
          {props.questionnaires.entry
            ?.map((entry) => entry.resource as Questionnaire)
            .map((questionnaire) => (
              <div key={questionnaire.id}>
                <h3>
                  <MedplumLink to={`/forms/${questionnaire?.id}?subject=${getReferenceString(props.resource)}`}>
                    {questionnaire.name}
                  </MedplumLink>
                </h3>
                <p>{questionnaire?.description}</p>
              </div>
            ))}
        </div>
      );
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
      return <QuestionnaireBuilder questionnaire={props.resource as Questionnaire} onSubmit={props.onSubmit} />;
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
