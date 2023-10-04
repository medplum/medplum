import { Box, Title, Text, Divider, Group } from '@mantine/core';
import { capitalize } from '@medplum/core';
import { DiagnosticReport, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum, ResourceAvatar } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconGenderMale, IconGenderFemale, IconReportMedical, IconUser } from '@tabler/icons-react';

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
        birthDate,
        gender,
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
      condition: ConditionList(category: "http://hl7.org/fhir/us/core/CodeSystem/condition-category|health-concern", subject: "Patient/${id}") {
        resourceType,
        meta { lastUpdated },
        category {
          coding {
            code,
          }
        },
        clinicalStatus {
          coding {
            display
          }
        },
        code {
          coding {
            display
          }
        },
      },
      vitals: ObservationList(category: "http://terminology.hl7.org/CodeSystem/observation-category|vital-signs", subject: "Patient/${id}") {
        meta { lastUpdated },
        code {
          coding {
            code,
            display
          }
        },
        valueCodeableConcept {
          coding {
            code,
            display
          }
        },
        valueQuantity {
          value,
          unit
        },
        valueInteger,
        effectiveDateTime,
        valueString
      },
      observations: ObservationList(_filter: "category ne http://terminology.hl7.org/CodeSystem/observation-category|vital-signs", subject: "Patient/${id}") {
         id,
         category {
          coding {
            code,
          }
        },
      },
      socialHistory: ObservationList(category: "http://terminology.hl7.org/CodeSystem/observation-category|social-history", subject: "Patient/${id}") {
        meta { lastUpdated },
        effectiveDateTime,
        code {
          coding {
            code,
            display
          }
        },
        valueCodeableConcept {
          coding {
            code,
            display
          }
        }
      },
      familyMembers: FamilyMemberHistoryList(patient: "Patient/${id}") {
        meta { lastUpdated },
        relationship {
          coding {
            code,
            display
          }
        }
      }
    }`;

    medplum.graphql(query).then(setResponse);
  }, [medplum, id]);

  return <GraphQLResponseViewer responseData={response?.data ?? []} />;
}

const RenderGraphQLResponse: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <Box />;
  }

  const isIndex = (key: any) => !isNaN(parseInt(key));

  const renderData = (key: string, value: any) => {
    if (!value) {
      return undefined;
    }

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
    } else if (typeof value === 'object' && !!value) {
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
    <Box>{Object.entries(data).map(([key, value]) => !!value && <Box key={key}>{renderData(key, value)}</Box>)}</Box>
  );
};

const GraphQLResponseViewer: React.FC<{ responseData: any }> = ({ responseData }) => {
  if (!responseData) return <div>No Response Data</div>;
  return (
    <Box p={8} w="33%">
      {Object.entries(responseData).map(([key, data]) => {
        switch (key) {
          case 'patient':
            return (
              <Box key={key} p={8}>
                <PatientPanel patient={data as Patient} />
              </Box>
            );
          case 'vitals':
            return (
              <Box key={key} p={8}>
                <Title mb={8} order={4}>
                  {capitalize(key)}
                </Title>
                <RenderVitals data={data as any} />
              </Box>
            );
          // case 'reports':
          //   return (
          //     <Box key={key} p={8}>
          //       <Title>Report</Title>
          //       <Reports data={data as any} />
          //     </Box>
          //   );
          case 'socialHistory':
            return (
              <Box key={key} p={8}>
                <Title mb={8} order={4}>
                  {capitalize(key)}
                </Title>
                <RenderSocialHistory key={key} data={data as any} />
              </Box>
            );
          default:
            return (
              <Box key={key} p={8}>
                <Title order={4}>{capitalize(key)}</Title>
                <RenderGraphQLResponse data={data} />
              </Box>
            );
        }
      })}
    </Box>
  );
};

function processData(vitalsData: any[]): any[] {
  const groupedVitals = vitalsData.reduce((acc, vital) => {
    const code = vital.code.coding[0].code;

    if (!acc[code]) {
      acc[code] = [];
    }

    acc[code].push(vital);
    return acc;
  }, {});

  // Select most recent from each group based on effectiveDateTime
  const mostRecentVitals = Object.values(groupedVitals).map((vitalGroup: any[]) => {
    return vitalGroup.sort(
      (a, b) => new Date(b.effectiveDateTime).getTime() - new Date(a.effectiveDateTime).getTime()
    )[0];
  });

  return mostRecentVitals;
}

function RenderVitals(props: any): JSX.Element {
  const processedData = processData(props.data);

  return (
    <Box>
      {processedData.map((vital, index) => (
        <RenderVital key={index} vital={vital as any} />
      ))}
    </Box>
  );
}

const renderCoding = (coding: any[]) => {
  return coding.map((codeItem, index) => (
    <Box key={index}>
      <Text>{codeItem.display}</Text>
    </Box>
  ));
};

function RenderVital(props: any): JSX.Element | undefined {
  if (!props.vital.valueQuantity) {
    return undefined;
  }

  return (
    <>
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        <Box display="flex">{renderCoding(props.vital?.code?.coding)}</Box>
        <Text>{`${props.vital.valueQuantity.value}${props.vital.valueQuantity.unit}`}</Text>
      </Box>
      <Divider my="sm" />
    </>
  );
}

function RenderSocialHistory(props: any): JSX.Element {
  const processedData = processData(props.data);
  return (
    <Box>
      {processedData.map((item, index) => (
        <RenderSocialHistoryItem key={index} item={item as any} />
      ))}
    </Box>
  );
}

function RenderSocialHistoryItem(props: any): JSX.Element | null {
  if (!props.item.valueCodeableConcept || !props.item.valueCodeableConcept.coding) {
    return null;
  }

  return (
    <>
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        <>{renderCoding(props.item?.code?.coding)}</>
        <Text>{props.item.valueCodeableConcept.coding[0].display}</Text>
      </Box>
      <Divider my="sm" />
    </>
  );
}

// function Reports(props: any): JSX.Element | undefined {
//   console.log(props.data);
//   return (
//     <>
//       {props.data.map((d: any) => (
//         <DiagnosticReportDisplay key={d.id} value={createReference(d)} />
//       ))}
//     </>
//   );
// }

function PatientPanel(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  return (
    <Box display="flex" style={{ flexDirection: 'column', alignItems: 'center' }}>
      <ResourceAvatar value={patient} size="lg" />
      <Title order={4}>{formatName(patient)}</Title>
      <BirthdateAndAge patient={patient} />
      <DescriptionBox patient={patient} />
    </Box>
  );
}

function BirthdateAndAge(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const { years, months } = calculateAge(patient.birthDate as string);
  return (
    <Box display="flex">
      <Text pr={5}>{patient.birthDate}</Text>
      <Text>{`(${years}yrs, ${months}mo)`}</Text>
    </Box>
  );
}

function calculateAge(birthdate: string): { years: number; months: number } {
  const birthDate = new Date(birthdate);
  const currentDate = new Date();

  let years = currentDate.getFullYear() - birthDate.getFullYear();
  let months = currentDate.getMonth() - birthDate.getMonth();

  // If the current month is before the birth month, or it's the birth month but the day is before the birth day
  if (
    currentDate.getMonth() < birthDate.getMonth() ||
    (currentDate.getMonth() === birthDate.getMonth() && currentDate.getDate() < birthDate.getDate())
  ) {
    years--;
    months += 12;
  }

  months = months < 0 ? 0 : months;
  return { years, months };
}

function DescriptionBox(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  return (
    <Group
      display="flex"
      grow
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        border: '1px solid gray',
        padding: '10px',
        borderRadius: 10,
      }}
    >
      <Box>
        <IconUser />
        <Text fz="xs">{formatName(patient)}</Text>
      </Box>
      <Divider orientation="vertical" />
      <Box>
        <IconReportMedical />
        <Text fz="xs">Alice Smith</Text>
      </Box>
      <Divider orientation="vertical" />
      <Box>
        {patient.gender === 'male' ? <IconGenderMale /> : <IconGenderFemale />}
        <Text fz="xs">{patient.gender}</Text>
      </Box>
    </Group>
  );
}

function formatName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) {
    return '';
  }
  if (!name.family || !name.given?.[0]) {
    return '';
  }
  const middleInitial = name.given?.[1]?.charAt(0);
  if (!middleInitial) {
    return `${name.given?.[0]} ${name.family}`;
  }
  return `${name.given?.[0]} ${middleInitial} ${name.family}`;
}

// reports: DiagnosticReportList(subject: "Patient/${id}") {
//   id,
//   resourceType,
//   meta { lastUpdated },
//   status,
//   code {
//     coding {
//       code
//     }
//   },
//   issued
// }
