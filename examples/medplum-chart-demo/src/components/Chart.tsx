import { Box } from '@mantine/core';
import { DiagnosticReport, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface PatientGraphQLResponse {
  data: {
    patient: Patient;
    orders: ServiceRequest[];
    reports: DiagnosticReport[];
  };
}

export function Chart(): JSX.Element {
  const { id } = useParams();
  const medplum = useMedplum();

  const [response, setResponse] = useState<PatientGraphQLResponse>();

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
      appointments: AppointmentList(_filter: "patient=Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        status,
        description,
        start,
        end,
        minutesDuration
      },
      allergyIntolerances: AllergyIntoleranceList(patient: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        }
      },
      conditions: ConditionList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        }
      },
      procedures: ProcedureList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        }
      },
      observations: ObservationList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        },
        valueString,
        valueQuantity {
          value,
          unit
        }
      },
      familyMembers: FamilyMemberHistoryList(patient: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        relationship {
          text
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

  console.log(response);

  return <Box>Chart for patient {id}</Box>;
}
