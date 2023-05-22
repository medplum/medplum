import { Loader, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { DiagnosticReport, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import React, { useContext, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';
import { Link } from 'react-router-dom';

interface PatientGraphQLResponse {
  data: {
    patient: Patient;
    orders: ServiceRequest[];
    reports: DiagnosticReport[];
  };
}

const PatientContext = React.createContext({} as PatientGraphQLResponse);

export function PatientPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [tab, setTab] = useState<string | null>('');

  const [response, setResponse] = useState<PatientGraphQLResponse>();

  /**
   * Use the [FHIR graphQL schema](http://hl7.org/fhir/R4B/graphql.html) to query
   * multiple resources related to this patient
   */
  useEffect(() => {
    const query = `{
      patient: Patient(id: "${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        birthDate,
        name {
          given,
          family
        },
        telecom {
          system,
          value
        },
        address {
          line,
          city,
          state
        }
        photo {
          contentType,
          url,
          title
        }
      },
      orders: ServiceRequestList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        category {
          text
        },
        code {
          text
        }
      },
      reports: DiagnosticReportList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        }
      }
    }`;
    medplum.graphql(query).then(setResponse);
  }, [medplum, id]);

  if (!response) {
    return <Loader />;
  }

  const { patient } = response.data;
  return (
    <PatientContext.Provider value={response}>
      <PatientHeader patient={patient} key={getReferenceString(patient)} />
      <Tabs value={tab} onTabChange={setTab}>
        <Tabs.List bg="white">
          <TabLink value="overview" />
          <TabLink value="timeline" />
          <TabLink value="history" />
        </Tabs.List>
      </Tabs>
      <Outlet />
    </PatientContext.Provider>
  );
}

export function usePatientInfo() {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error('Missing PatientContext');
  }
  return context;
}

function TabLink(props: { value: string }): JSX.Element {
  const capitalizedFirstLetterValue = props.value.charAt(0).toUpperCase() + props.value.slice(1);
  return (
    <Link to={props.value} style={{ textDecoration: 'none' }}>
      <Tabs.Tab value={props.value}>{capitalizedFirstLetterValue}</Tabs.Tab>
    </Link>
  );
}
