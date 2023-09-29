import { Box, Title, Text } from '@mantine/core';
import { capitalize } from '@medplum/core';
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
        id,
        meta { lastUpdated },
        code {
          coding {
            code,
          }
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
          coding {
            code,
          }
        }
      },
      procedures: ProcedureList(subject: "Patient/${id}") {
        resourceType,
        id,
        meta { lastUpdated },
        code {
          coding {
            code,
          }
        }
      },
      observations: ObservationList(subject: "Patient/${id}") {
        id,
        meta { lastUpdated },
        code {
          coding {
            code,
          }
        }
      },
      familyMembers: FamilyMemberHistoryList(patient: "Patient/${id}") {
        id,
        meta { lastUpdated },
        relationship {
          coding {
            code,
            display
          }
        }
      },  
      orders: ServiceRequestList(subject: "Patient/${id}") {
        id,
        meta { lastUpdated },
        status,
        intent
      },
      reports: DiagnosticReportList(subject: "Patient/${id}") {
        id,
        meta { lastUpdated },
        status,
        code {
          coding {
            code
          }
        },
        issued
      }
    }`;

    medplum.graphql(query).then(setResponse);
  }, [medplum, id]);

  return <GraphQLResponseViewer responseData={response?.data ?? []} />;
}

const RenderGraphQLResponse: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div />;
  }

  const isIndex = (key: any) => !isNaN(parseInt(key));

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
        <Box p={8}>
          {value.map((item, index) => (
            <RenderGraphQLResponse key={index} data={item} />
          ))}
        </Box>
      );
    } else if (typeof value === 'object' && !!value ) {
      return (
        <Box p={8}>
          {!isIndex(key) && <Text fw={700}>{capitalize(key)}:</Text>}
          <RenderGraphQLResponse data={value} />
        </Box>
      );
    } else {
      return (
        <Box p={8}>
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
