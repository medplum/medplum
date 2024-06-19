import { Button, Menu, Tabs } from '@mantine/core';
import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Coding, Patient } from '@medplum/fhirtypes';
import { SearchControl } from '@medplum/react';
import { IconMenu2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObservationGraph } from './graphs/ObservationGraph';

interface PatientObservationsProps {
  patient: Patient;
}

const weightCoding: Coding = {
  system: 'http://loinc.org',
  code: '29463-7',
  display: 'weight',
};

const heightCoding: Coding = {
  system: 'http://loinc.org',
  code: '8302-2',
  display: 'height',
};

const bloodPressureCoding: Coding = {
  system: 'http://loinc.org',
  code: '85354-9',
  display: 'blood-pressure',
};

const bmiCoding: Coding = {
  system: 'http://loinc.org',
  code: '39156-5',
  display: 'bmi',
};

export function PatientObservations(props: PatientObservationsProps): JSX.Element {
  const navigate = useNavigate();

  const tabs = [
    ['all', 'All Observations'],
    ['height', 'Height'],
    ['weight', 'Weight'],
    ['blood-pressure', 'Blood Pressure'],
    ['bmi', 'BMI'],
  ];
  const [currentTab, setCurrentTab] = useState<string[]>(tabs[0]);

  const search: SearchRequest = {
    resourceType: 'Observation',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` }],
    fields: ['status', 'code', 'focus'],
  };

  return (
    <div>
      <Menu>
        <Menu.Target>
          <Button leftSection={<IconMenu2 />} variant="default">
            {currentTab[1]}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {tabs.map((tab) => (
            <Menu.Item key={tab[0]} onClick={() => setCurrentTab(tab)}>
              {tab[1]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Tabs value={currentTab[0]} mt="md">
        <Tabs.Panel value="all">
          <SearchControl
            search={search}
            hideFilters={true}
            hideToolbar={true}
            onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
            onChange={(e) => {
              navigate(`/${search.resourceType}${formatSearchQuery(e.definition)}`);
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="height">
          <ObservationGraph code={heightCoding} patient={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="weight">
          <ObservationGraph code={weightCoding} patient={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="blood-pressure">
          <ObservationGraph code={bloodPressureCoding} patient={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="bmi">
          <ObservationGraph code={bmiCoding} patient={props.patient} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
