import { Loader, Tabs } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { DiagnosticReport, Patient, ServiceRequest } from '@medplum/fhirtypes';
import {
  AddressDisplay,
  ContactPointDisplay,
  Document,
  PatientTimeline,
  ResourceHistoryTable,
  ResourceName,
  useMedplum,
} from '@medplum/react';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';

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
  const [tab, setTab] = useState<string | null>('overview');

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

  const { patient, orders, reports } = response.data;

  return (
    <PatientContext.Provider value={response}>
      <PatientHeader patient={patient} key={getReferenceString(patient)} />
      {/* Use the Mantine Tabs components to implement a simple tabbed layout */}
      <Tabs value={tab} onTabChange={setTab}>
        <Tabs.List bg="white">
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview">
          {/*
           * You can combine Medplum components with plain HTML to quickly display patient data.
           * Medplum has out of the box components to render common data types such as
           *   - Addresses
           *   - Phone numbers
           *   - Patient/Provider names
           *   - Patient/Provider profile photo
           * */}
          <Document>
            <div className="patient-sidebar">
              <div className="patient-title">
                <ResourceName value={patient} />
              </div>
              <h3>Birth Date</h3>
              <div>{patient.birthDate}</div>
              <h3>Address</h3>
              {patient.address?.map((a, i) => (
                <div key={`address-${i}`}>
                  <AddressDisplay value={a} />
                </div>
              ))}
              <h3>Contact</h3>
              {patient.telecom?.map((t, i) => (
                <div key={`contact-${i}`}>
                  <ContactPointDisplay value={t} />
                </div>
              ))}
            </div>
            <div className="patient-demographics">
              <h3>Demographics</h3>
              <div>Created Date: {formatDate(patient.meta?.lastUpdated)}</div>
              <table>
                <tbody>
                  <tr>
                    <td>Prefix: {patient?.name?.[0]?.prefix}</td>
                    <td>First: {patient?.name?.[0]?.given?.[0]}</td>
                    <td>Middle: {patient?.name?.[0]?.given?.[1]}</td>
                    <td>Last: {patient?.name?.[0]?.family}</td>
                    <td>Suffix: {patient?.name?.[0]?.suffix}</td>
                  </tr>
                </tbody>
              </table>
              <h3>Orders ({orders?.length})</h3>
              <ul>
                {orders?.map((o, i) => (
                  <li key={`order-${i}`}>
                    <a href={`/ServiceRequest/${o.id}`}>{o.code?.text}</a> ({formatDate(o.meta?.lastUpdated)})
                  </li>
                ))}
              </ul>
              <h3>Reports ({reports?.length})</h3>
              <ul>
                {reports?.map((o, i) => (
                  <li key={`report-${i}`}>
                    <a href={`/DiagnosticReport/${o.id}`}>
                      {o.code?.text} ({formatDate(o.meta?.lastUpdated)})
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Document>
        </Tabs.Panel>
        {/*
         * The PatientTimeline component displays relevant events related to the patient
         */}
        <Tabs.Panel value="timeline">
          <PatientTimeline patient={patient} />
        </Tabs.Panel>
        {/*
         * The ResourceHistoryTable allows you to audit all the changes that have been made to the Patient resource
         */}
        <Tabs.Panel value="history">
          <Document>
            <ResourceHistoryTable resourceType="Patient" id={patient.id} />
          </Document>
        </Tabs.Panel>
      </Tabs>
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