import { usePatientInfo } from '../pages/PatientPage';
import React from 'react';
import { AddressDisplay, ContactPointDisplay, Document, ResourceName } from '@medplum/react';
import { formatDate } from '@medplum/core';

/*
 * You can combine Medplum components with plain HTML to quickly display patient data.
 * Medplum has out of the box components to render common data types such as
 *   - Addresses
 *   - Phone numbers
 *   - Patient/Provider names
 *   - Patient/Provider profile photo
 * */
export function PatientOverview(): JSX.Element {
  const { patient, orders, reports } = usePatientInfo().data;
  return (
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
  );
}
