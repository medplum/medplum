import { Box, Title, Text } from '@mantine/core';
import { capitalize } from '@medplum/core';
import { DiagnosticReport, Patient, Resource, ServiceRequest } from '@medplum/fhirtypes';
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
      appointments: AppointmentList(patient: "Patient/${id}") {
        id
        status
        priority
      },
      allergyIntolerances: AllergyIntoleranceList(patient: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          text
        }
        note {
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

  return <GraphQLResponseViewer responseData={response?.data ?? []} />;
}

const RenderGraphQLResponse: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div />;
  }

  const renderData = (key: string, value: any) => {
    if (Array.isArray(value)) {
      if (value.every((item: any) => typeof item !== 'object' || !item)) {
        return (
          <Box p={8}>
            <Text fw={700}>{capitalize(key)}:</Text> {value.join(', ')}
          </Box>
        );
      }

      return (
        <Box p={isNumeric(key) ? 0 : 8}>
          {' '}
          {value.map((item, index) => (
            <RenderGraphQLResponse key={index} data={item} />
          ))}
        </Box>
      );
    } else if (typeof value === 'object' && !!value) {
      return (
        <Box p={8}>
          <Text fw={700}>{capitalize(key)}:</Text>
          <RenderGraphQLResponse data={value} />
        </Box>
      );
    } else {
      return (
        <Box p={isNumeric(key) ? 0 : 8}>
          {' '}
          {isNumeric(key) ? '' : <Text fw={700}>{capitalize(key)}:</Text>} {value}
        </Box>
      );
    }
  };

  const isNumeric = (str: string) => {
    return !isNaN(Number(str));
  };

  return (
    <Box>
      {Object.entries(data).map(([key, value]) => (
        <Box key={key}>{renderData(key, value)}</Box>
      ))}
    </Box>
  );
};

// Usage
const GraphQLResponseViewer: React.FC<{ responseData: any }> = ({ responseData }) => {
  if (!responseData) return <div>No Response Data</div>;

  return (
    <Box p={8}>
      {Object.entries(responseData).map(([key, data]) => (
        <Box key={key} p={8}>
          <Title order={2}>{capitalize(key)}</Title>
          <RenderGraphQLResponse data={data} />
        </Box>
      ))}
    </Box>
  );
};
