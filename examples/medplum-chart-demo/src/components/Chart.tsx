import { Box, Button, Title, Text, Divider, Group, createStyles, NumberInput } from '@mantine/core';
import { capitalize } from '@medplum/core';
import {
  Patient,
  Observation,
  CodeableConcept,
  Resource,
  Condition,
  AllergyIntolerance,
  Coding,
  Quantity,
} from '@medplum/fhirtypes';
import { useMedplum, ResourceAvatar, useResource } from '@medplum/react';
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconGenderMale, IconGenderFemale, IconReportMedical, IconUser } from '@tabler/icons-react';
import { TaskList } from './Task';

interface PatientGraphQLResponse {
  data: {
    patient: Patient;
    condition: Condition[];
    vitals: Observation[];
    observations: Observation[];
    socialHistory: Observation[];
    allergies: AllergyIntolerance[];
  };
}

type PanelData = Resource & {
  code: CodeableConcept;
  effectiveDateTime: string;
  valueQuantity: Quantity;
  criticality: string;
  valueCodeableConcept: CodeableConcept;
};

const useStyles = createStyles((theme) => ({
  subColor: {
    color: theme.colors.gray[6],
  },
  group: {
    justifyContent: 'space-between',
    border: '1px solid gray',
    padding: '10px',
    borderRadius: 10,
    flex: 1,
  },
  descriptionCell: {
    flexDirection: 'column',
    alignItems: 'center',
  },
}));

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
        address {
          line,
          city,
          state
        }
        photo {
          contentType,
          url,
          title
        },
        tasks: TaskList(_reference: patient) {
          id,
          status,
          description,
          focus {
            reference
          },
          lastModified,
          status
        }
      },
      allergies: AllergyIntoleranceList(patient: "Patient/${id}") {
        meta { lastUpdated },
        code {
          coding {
            code,
            display
          }
        },
        criticality
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
      vitals: ObservationList(category: "http://terminology.hl7.org/CodeSystem/observation-category|vital-signs", subject: "Patient/${id}") {
        meta { lastUpdated },
        id,
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
      observations: ObservationList(_filter: "category ne http://terminology.hl7.org/CodeSystem/observation-category|vital-signs and category ne http://terminology.hl7.org/CodeSystem/observation-category|social-history", subject: "Patient/${id}") {
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
        effectiveDateTime
      }
    }`;

    medplum.graphql(query).then(setResponse);
  }, [medplum, id]);

  return <ChartView response={response} />;
}

interface ChartViewProps {
  response?: PatientGraphQLResponse;
}

function ChartView(props: ChartViewProps): JSX.Element {
  if (!props.response) {
    return <Box />;
  }
  return (
    <Box display="flex">
      <ClientPanel response={props.response} />
      <TaskList tasks={props.response.data.patient.tasks} />
    </Box>
  );
}

function ClientPanel(props: ChartViewProps): JSX.Element {
  if (!props.response) {
    return <Box />;
  }
  const responseData = props.response.data;

  return (
    <Box p={8} w="33%">
      {Object.entries(responseData).map(([key, data]) => {
        if (!data) {
          return undefined;
        }

        switch (key) {
          case 'patient':
            return (
              <Box key={key} p={8}>
                <PatientPanel patient={data as Patient} />
              </Box>
            );
          case 'vitals':
            return renderProcessedData(key, data as PanelData[], RenderVital);
          case 'observations':
            return renderProcessedData(key, data as PanelData[], RenderObservationItem);
          case 'allergies':
            return renderProcessedData(key, data as PanelData[], RenderAllergyItem);
          case 'socialHistory':
            return renderProcessedData(key, data as PanelData[], RenderSocialHistoryItem);
          default:
            return;
        }
      })}
    </Box>
  );
}

function renderProcessedData(
  key: string,
  data: PanelData[],
  RenderComponent: React.ComponentType<{ item: PanelData }>
): JSX.Element {
  const processedData = processData(data);
  return (
    <Box key={key} p={8}>
      <Text mb={8} fz={'xl'}>
        {capitalize(key)}
      </Text>
      {processedData.map((item, index) => (
        <RenderComponent key={index} item={item} />
      ))}
    </Box>
  );
}

function processData(data: PanelData[]): PanelData[] {
  // Define the accumulator type for clarity and to solve the indexing problem
  interface GroupedPanelData {
    [key: string]: PanelData[];
  }

  const groupedObservation = data.reduce<GroupedPanelData>((acc, observation) => {
    const code = observation?.code?.coding?.[0]?.code ?? '';
    if (!acc[code]) {
      acc[code] = [];
    }

    acc[code].push(observation);
    return acc;
  }, {});

  // Select most recent from each group based on effectiveDateTime
  const recentPanelData = Object.values(groupedObservation).map((obsGroup: PanelData[]) => {
    return obsGroup.sort(
      (a, b) => new Date(b?.effectiveDateTime as string).getTime() - new Date(a?.effectiveDateTime as string).getTime()
    )[0];
  });

  return recentPanelData;
}

const renderCoding = (coding?: Coding[]): string => {
  if (!coding) {
    return '';
  }
  return coding.map((codeItem) => codeItem.display).join(', ');
};

function RenderVital(props: { item: PanelData }): JSX.Element | undefined {
  if (!props.item.valueQuantity) {
    return undefined;
  }
  const [item, setItem] = useState(props.item);
  const medplum = useMedplum();

  const handleSubmit = async () => {
    const resourceItem = (await medplum.readResource('Observation', item.id ?? '')) as Observation;
    const { id, ...itemWithoutId } = resourceItem;
    const mergedItem = {
      ...itemWithoutId,
      valueQuantity: {
        ...resourceItem.valueQuantity,
        ...item.valueQuantity,
      },
    } as Observation;
    const a = await medplum.createResource<Observation>(mergedItem);
    console.log(a);
  };
  const handleChange = (newValue: number) => {
    console.log(newValue);
    setItem({ ...item, valueQuantity: { ...item.valueQuantity, value: newValue } });
  };

  return <ValueQuantityDisplay item={item} onChange={handleChange} handleSubmit={handleSubmit} />;
}

function RenderObservationItem(props: { item: PanelData }): JSX.Element | undefined {
  if (!props.item.valueQuantity && !props.item.valueCodeableConcept) {
    return undefined;
  }
  const measurement = props.item.valueQuantity
    ? `${props.item.valueQuantity.value}${props.item.valueQuantity.unit}`
    : props.item.valueCodeableConcept.coding?.[0].display;
  const values = [renderCoding(props.item?.code?.coding), measurement ?? ''];

  return <RenderItem items={values} />;
}

function RenderAllergyItem(props: { item: PanelData }): JSX.Element | undefined {
  if (!props.item.code?.coding) {
    return undefined;
  }
  const values = [renderCoding(props.item?.code?.coding), `Critically: ${props.item.criticality}`];
  return <RenderItem items={values} />;
}

function RenderSocialHistoryItem(props: { item: PanelData }): JSX.Element | null {
  if (!props.item.valueCodeableConcept || !props.item.valueCodeableConcept.coding) {
    return null;
  }

  const values = [renderCoding(props.item?.code?.coding), props.item.valueCodeableConcept.coding[0].display ?? ''];
  return <RenderItem items={values} />;
}

export function ValueQuantityDisplay(props: {
  item: PanelData;
  onChange: any;
  handleSubmit: any;
}): JSX.Element | undefined {
  const [isFocused, setIsFocused] = useState(false);
  const buttonRef = useRef(null);
  if (!props.item?.valueQuantity) {
    return undefined;
  }
  const suffix = props.item.valueQuantity.unit ?? '';
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget === buttonRef.current) {
      return;
    }
    setIsFocused(false);
  };
  return (
    <Box>
      <Text>{renderCoding(props.item?.code?.coding)}</Text>
      <Box display="flex">
        <NumberInput
          defaultValue={props.item.valueQuantity.value}
          onChange={props.onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          formatter={(value) =>
            !Number.isNaN(parseFloat(value))
              ? `${value}${suffix}`.replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')
              : ` ${suffix}`
          }
        />
        {isFocused && (
          <Button
            ref={buttonRef}
            onClick={() => {
              console.log('Button clicked!');
              props.handleSubmit();
              setIsFocused(false);
            }}
            variant="subtle"
          >
            Save
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function RenderItem(props: { items: string[] }): JSX.Element | undefined {
  const items = props.items;
  if (!items || items.length === 0) {
    return;
  }

  const widthPercentage = `${100 / items.length}%`;

  return (
    <>
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        {items.map((item, index) => (
          <Text
            key={index}
            w={widthPercentage}
            align={index === 0 ? 'left' : index === items.length - 1 ? 'right' : 'center'}
          >
            {item}
          </Text>
        ))}
      </Box>
      <Divider my="sm" />
    </>
  );
}

// Patient Rendering

function PatientPanel(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const { classes } = useStyles();
  return (
    <Box display="flex" className={classes.descriptionCell}>
      <ResourceAvatar value={patient} size="lg" mb={8} />
      <Title mb={8} order={4}>
        {formatName(patient)}
      </Title>
      <BirthdateAndAge patient={patient} />
      <DescriptionBox patient={patient} />
    </Box>
  );
}

function BirthdateAndAge(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const { classes } = useStyles();
  const { years, months } = calculateAge(patient.birthDate as string);
  return (
    <Box display="flex" mb={16} className={classes.subColor}>
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
  const { classes } = useStyles();
  return (
    <Group display="flex" grow spacing="md" w="75%" className={classes.group}>
      <Box display="flex" className={classes.descriptionCell}>
        <IconUser className={classes.subColor} />
        <Text fz="xs" align="center">
          {formatName(patient)}
        </Text>
      </Box>
      <Box display="flex" className={classes.descriptionCell}>
        <IconReportMedical className={classes.subColor} />
        <Text fz="xs">Alice Smith</Text>
      </Box>
      <Box display="flex" className={classes.descriptionCell}>
        {patient.gender === 'male' ? (
          <IconGenderMale className={classes.subColor} />
        ) : (
          <IconGenderFemale className={classes.subColor} />
        )}
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
