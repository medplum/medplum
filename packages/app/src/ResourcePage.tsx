import {
  Bundle,
  Encounter,
  getDisplayString,
  Questionnaire,
  Resource
} from '@medplum/core';
import {
  Button,
  Document,
  EncounterTimeline,
  keyReplacer,
  Loading,
  parseForm,
  QuestionnaireForm,
  ResourceBlame,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  Tab,
  TabBar,
  TabPanel,
  TabSwitch,
  useMedplum
} from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';

function getTabs(resourceType: string): string[] {
  const result = [];

  if (resourceType === 'Encounter') {
    result.push('Timeline');
  }

  if (resourceType === 'Questionnaire') {
    result.push('Preview', 'Builder');
  }

  result.push('Details', 'Edit', 'History', 'Blame', 'JSON');
  return result;
}

export function ResourcePage() {
  const { resourceType, id, tab } = useParams<{ resourceType: string, id: string, tab: string }>();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [value, setValue] = useState<Resource | undefined>();
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState();

  function loadResource() {
    setLoading(true);
    medplum.read(resourceType, id)
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

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !value || !historyBundle) {
    return <Loading />;
  }

  const tabs = getTabs(resourceType);
  const defaultTab = tabs[0].toLowerCase();

  return (
    <>
      <div style={{
        backgroundColor: 'white',
        borderBottom: '2px solid #eee',
        color: '#444',
        fontWeight: 'bold',
        padding: '15px 30px',
      }}>
        {value ? getDisplayString(value) : `${resourceType} ${id}`}
      </div>
      <TabBar
        value={tab || defaultTab}
        onChange={(name: string) => history.push(`/${resourceType}/${id}/${name}`)}>
        {tabs.map(t => <Tab key={t} name={t.toLowerCase()} label={t} />)}
      </TabBar>
      <Document>
        <TabSwitch value={tab || defaultTab}>
          {tabs.map(t => (
            <TabPanel key={t} name={t.toLowerCase()}>
              <ResourceTab
                name={t.toLowerCase()}
                resource={value}
                resourceHistory={historyBundle}
                onSubmit={(resource: Resource) => {
                  medplum.update(resource).then(() => loadResource());
                }}
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
}

function ResourceTab(props: ResourceTabProps): JSX.Element | null {
  switch (props.name) {
    case 'details':
      return (
        <ResourceTable resource={props.resource} />
      );
    case 'edit':
      return (
        <ResourceForm resource={props.resource} onSubmit={props.onSubmit} />
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
        <form onSubmit={e => {
          e.preventDefault();
          const formData = parseForm(e.target as HTMLFormElement);
          props.onSubmit(JSON.parse(formData.resource));
        }}>
          <textarea
            id="resource"
            data-testid="resource-json"
            name="resource"
            defaultValue={JSON.stringify(props.resource, keyReplacer, 2)}
          />
          <Button type="submit">OK</Button>
        </form>
      );
    case 'timeline':
      return (
        <EncounterTimeline resource={props.resource as Encounter} />
      );
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
