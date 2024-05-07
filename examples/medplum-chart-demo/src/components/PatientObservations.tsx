import { Tabs } from '@mantine/core';
import { formatSearchQuery, Operator, SearchRequest } from '@medplum/core';
import { Coding, Patient } from '@medplum/fhirtypes';
import { SearchControl, useMedplum } from '@medplum/react';
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

export function PatientObservations(props: PatientObservationsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  // const [tab, setTab] = useState;

  const tabs = [
    ['all', 'All Observations'],
    ['height', 'Height'],
    ['weight', 'Weight'],
    ['blood-pressure', 'Blood Pressure'],
    // ['systolic', 'Systolic BP'],
    // ['diastolic', 'Diastolic BP'],
    ['bmi', 'BMI'],
  ];

  const search: SearchRequest = {
    resourceType: 'Observation',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${props.patient.id}` }],
    fields: ['status', 'code', 'focus'],
  };

  return (
    <div>
      <Tabs defaultValue={tabs[0][0]}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab value={tab[0]} key={tab[0]}>
              {tab[1]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
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
        {/* <Tabs.Panel value="systolic">
          <ObservationGraph code={systolicCoding} patient={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="diastolic">
          <ObservationGraph code={diastolicCoding} patient={props.patient} />
        </Tabs.Panel> */}
      </Tabs>
    </div>
  );
}
