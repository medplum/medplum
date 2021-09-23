import {
  Bot,
  Bundle,
  getDisplayString,
  OperationOutcome,
  OperationOutcomeError,
  Patient,
  Questionnaire,
  Reference,
  Resource,
  stringify
} from '@medplum/core';
import {
  Button,
  DefaultResourceTimeline,
  Document,
  EncounterTimeline,
  Form,
  Loading,
  MedplumLink,
  PatientTimeline,
  QuestionnaireForm,
  ResourceBlame,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  Tab,
  TabBar,
  TabPanel,
  TabSwitch,
  TitleBar,
  useMedplum
} from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import { PatientHeader } from './PatientHeader';

function getTabs(resourceType: string): string[] {
  const result = [];

  if (resourceType === 'Encounter' || resourceType === 'Patient' || resourceType === 'Subscription') {
    result.push('Timeline');
  }

  if (resourceType === 'Bot') {
    result.push('Timeline', 'Editor');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder');
  }

  result.push('Details', 'Edit', 'History', 'Blame', 'JSON');
  return result;
}

function getPatient(resource: Resource): Patient | Reference | undefined {
  if (resource.resourceType === 'Patient') {
    return resource;
  }
  if (resource.resourceType === 'DiagnosticReport' ||
    resource.resourceType === 'Encounter' ||
    resource.resourceType === 'Observation' ||
    resource.resourceType === 'ServiceRequest') {
    return resource.subject;
  }
  return undefined;
}

export function ResourcePage() {
  const { resourceType, id, tab } = useParams<{ resourceType: string, id: string, tab: string }>();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [value, setValue] = useState<Resource | undefined>();
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState<OperationOutcomeError | undefined>();

  function loadResource(): Promise<void> {
    setError(undefined);
    setLoading(true);
    return medplum.read(resourceType, id)
      .then(result => setValue(result))
      .then(() => medplum.readHistory(resourceType, id))
      .then(result => setHistoryBundle(result))
      .then(() => setLoading(false))
      .catch(reason => {
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
      {patient && (
        <PatientHeader patient={patient} />
      )}
      {resourceType !== 'Patient' && (
        <TitleBar>
          <h1>{value ? getDisplayString(value) : `${resourceType} ${id}`}</h1>
        </TitleBar>
      )}
      <TabBar
        value={tab || defaultTab}
        onChange={(name: string) => history.push(`/${resourceType}/${id}/${name}`)}>
        {tabs.map(t => <Tab key={t} name={t.toLowerCase()} label={t} />)}
      </TabBar>
      <Document>
        {error && (
          <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
        )}
        <TabSwitch value={tab || defaultTab}>
          {tabs.map(t => (
            <TabPanel key={t} name={t.toLowerCase()}>
              <ResourceTab
                name={t.toLowerCase()}
                resource={value}
                resourceHistory={historyBundle}
                onSubmit={(resource: Resource) => {
                  medplum.update(resource)
                    .then(loadResource)
                    .catch(setError);
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
  outcome?: OperationOutcome;
}

function ResourceTab(props: ResourceTabProps): JSX.Element | null {
  switch (props.name) {
    case 'details':
      return (
        <ResourceTable value={props.resource} />
      );
    case 'edit':
      return (
        <ResourceForm defaultValue={props.resource} onSubmit={props.onSubmit} outcome={props.outcome} />
      );
    case 'history':
      return (
        <ResourceHistoryTable history={props.resourceHistory} />
      );
    case 'blame':
      return (
        <ResourceBlame history={props.resourceHistory} />
      );
    case 'json':
      return (
        <Form onSubmit={(formData: Record<string, string>) => {
          props.onSubmit(JSON.parse(formData.resource));
        }}>
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
        <Form onSubmit={(formData: Record<string, string>) => {
          props.onSubmit({
            ...JSON.parse(stringify(props.resource)),
            code: formData.code
          });
        }}>
          <textarea
            id="code"
            data-testid="resource-code"
            name="code"
            defaultValue={(props.resource as Bot).code}
          />
          <Button type="submit">OK</Button>
        </Form>
      );
    case 'timeline':
      switch (props.resource.resourceType) {
        case 'Encounter':
          return (
            <EncounterTimeline encounter={props.resource} />
          );
        case 'Patient':
          return (
            <PatientTimeline patient={props.resource} />
          );
        default:
          return (
            <DefaultResourceTimeline resource={props.resource} />
          );
      }
    case 'preview':
      return (
        <QuestionnaireForm
          questionnaire={props.resource as Questionnaire}
          onSubmit={formData => {
            console.log('formData', formData);
          }}
        />
      );
  }
  return null;
}
