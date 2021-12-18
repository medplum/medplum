import { getDisplayString, OperationOutcomeError, stringify } from '@medplum/core';
import {
  Bot,
  Bundle,
  DiagnosticReport,
  OperationOutcome,
  Patient,
  Questionnaire,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import {
  Button,
  DefaultResourceTimeline,
  DiagnosticReportDisplay,
  Document,
  EncounterTimeline,
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
  TabBar,
  TabPanel,
  TabSwitch,
  TitleBar,
  useMedplum,
} from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';

function getTabs(resourceType: string): string[] {
  const result = [];

  if (
    resourceType === 'Encounter' ||
    resourceType === 'Patient' ||
    resourceType === 'Subscription' ||
    resourceType === 'ServiceRequest'
  ) {
    result.push('Timeline');
  }

  if (resourceType === 'Bot') {
    result.push('Timeline', 'Editor');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder');
  }

  if (resourceType === 'DiagnosticReport') {
    result.push('Report');
  }

  result.push('Details', 'Edit', 'History', 'Blame', 'JSON');
  return result;
}

function getPatient(resource: Resource): Patient | Reference<Patient> | undefined {
  if (resource.resourceType === 'Patient') {
    return resource;
  }
  if (
    resource.resourceType === 'DiagnosticReport' ||
    resource.resourceType === 'Encounter' ||
    resource.resourceType === 'Observation' ||
    resource.resourceType === 'ServiceRequest'
  ) {
    return resource.subject as Reference<Patient>;
  }
  return undefined;
}

export function ResourcePage() {
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
  const [error, setError] = useState<OperationOutcomeError | undefined>();

  function loadResource(): Promise<void> {
    setError(undefined);
    setLoading(true);
    return medplum
      .read(resourceType, id)
      .then((result) => setValue(result))
      .then(() => medplum.readHistory(resourceType, id))
      .then((result) => setHistoryBundle(result))
      .then(() => setLoading(false))
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadResource();
  }, [resourceType, id]);

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
  const patient = getPatient(value);

  return (
    <>
      {patient && <PatientHeader patient={patient} />}
      {resourceType !== 'Patient' && (
        <TitleBar>
          <h1>{value ? getDisplayString(value) : `${resourceType} ${id}`}</h1>
        </TitleBar>
      )}
      <TabBar value={tab || defaultTab} onChange={(name: string) => navigate(`/${resourceType}/${id}/${name}`)}>
        {tabs.map((t) => (
          <Tab key={t} name={t.toLowerCase()} label={t} />
        ))}
      </TabBar>
      <Document>
        {error && <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>}
        <TabSwitch value={tab || defaultTab}>
          {tabs.map((t) => (
            <TabPanel key={t} name={t.toLowerCase()}>
              <ResourceTab
                name={t.toLowerCase()}
                resource={value}
                resourceHistory={historyBundle}
                onSubmit={(resource: Resource) => {
                  medplum.update(cleanResource(resource)).then(loadResource).catch(setError);
                }}
                onDelete={() => {
                  if (window.confirm('Are you sure you want to delete this resource?')) {
                    medplum
                      .deleteResource(resourceType, id)
                      .then(() => navigate(`/${resourceType}`))
                      .catch(setError);
                  }
                }}
                outcome={error?.outcome}
              />
            </TabPanel>
          ))}
        </TabSwitch>
      </Document>
    </>
  );
}

interface ResourceTabProps {
  name: string;
  resource: Resource;
  resourceHistory: Bundle;
  onSubmit: (resource: Resource) => void;
  onDelete: (resource: Resource) => void;
  outcome?: OperationOutcome;
}

function ResourceTab(props: ResourceTabProps): JSX.Element | null {
  switch (props.name) {
    case 'details':
      return <ResourceTable value={props.resource} />;
    case 'edit':
      return (
        <ResourceForm
          defaultValue={props.resource}
          onSubmit={props.onSubmit}
          onDelete={props.onDelete}
          outcome={props.outcome}
        />
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
          <textarea
            id="resource"
            data-testid="resource-json"
            name="resource"
            defaultValue={stringify(props.resource, true)}
          />
          <Button type="submit">OK</Button>
        </Form>
      );
    case 'editor':
      return (
        <Form
          onSubmit={(formData: Record<string, string>) => {
            props.onSubmit({
              ...JSON.parse(stringify(props.resource)),
              code: formData.code,
            });
          }}
        >
          <textarea id="code" data-testid="resource-code" name="code" defaultValue={(props.resource as Bot).code} />
          <Button type="submit">OK</Button>
        </Form>
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
        <QuestionnaireForm
          questionnaire={props.resource as Questionnaire}
          onSubmit={(formData) => {
            console.log('formData', formData);
          }}
        />
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
