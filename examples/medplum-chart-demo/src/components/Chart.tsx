import {
  Box,
  Button,
  Divider,
  Group,
  NativeSelect,
  NumberInput,
  Text,
  Stack,
  createStyles,
  Card,
  Paper,
} from '@mantine/core';
import { capitalize, formatHumanName, calculateAgeString } from '@medplum/core';
import {
  AllergyIntolerance,
  CodeableConcept,
  Coding,
  Condition,
  Observation,
  Patient,
  Quantity,
  Resource,
} from '@medplum/fhirtypes';
import { CodingInput, ResourceAvatar, useMedplum } from '@medplum/react';
import { IconGenderFemale, IconGenderMale, IconReportMedical, IconUser } from '@tabler/icons-react';
import React, { useEffect, useRef, useState, ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
// import { TaskList } from './Task';

interface PatientGraphQLResponse {
  data: {
    patient: any;
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
          family,
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
        id,
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
        id,
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
        id,
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
        id,
        code {
          coding {
            code,
            system,
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
      {/* <TaskList tasks={props.response.data.patient.tasks} /> */}
    </Box>
  );
}

function ClientPanel(props: ChartViewProps): JSX.Element {
  if (!props.response) {
    return <Box />;
  }
  const responseData = props.response.data;

  return (
    <Paper p={8} w="33%">
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
            return renderProcessedData(key, data as PanelData[], RenderValueQuantity);
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
    </Paper>
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
      <Stack>
        <Text mb={8} fz={'xl'}>
          {capitalize(key)}
        </Text>
        {processedData.map((item, index) => (
          <RenderComponent key={index} item={item} />
        ))}
      </Stack>
    </Box>
  );
}

function processData(data: PanelData[]): PanelData[] {
  const groupedObservation = data.reduce<Record<string, PanelData[]>>((acc, observation) => {
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

function RenderObservationItem(props: { item: PanelData }): JSX.Element | undefined {
  if (!props.item.valueQuantity && !props.item.valueCodeableConcept) {
    return undefined;
  }
  return props.item.valueQuantity ? (
    <RenderValueQuantity item={props.item} />
  ) : (
    <Box>
      <Text>{renderCoding(props.item?.code?.coding)}</Text>
      <CodingInput property={{ binding: { valueSet: props.item.code.coding?.[0].system } }} name="hoorah" />
    </Box>
  );
}

function RenderValueQuantity(props: { item: PanelData }): JSX.Element | undefined {
  const medplum = useMedplum();
  const handleSubmit = async (modifiedItem: PanelData) => {
    const resourceItem = (await medplum.readResource('Observation', modifiedItem.id ?? '')) as Observation;
    const { id, ...itemWithoutId } = resourceItem;
    const mergedItem = {
      ...itemWithoutId,
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: {
        ...resourceItem.valueQuantity,
        ...modifiedItem.valueQuantity,
      },
    } as Observation;

    try {
      await medplum.createResource<Observation>(mergedItem);
    } catch (err) {
      console.log(err);
    }
  };

  return <ValueQuantityDisplay item={props.item} handleSubmit={handleSubmit} />;
}

function RenderAllergyItem(props: { item: AllergyIntolerance }): JSX.Element | undefined {
  const [item, setItem] = useState(props.item);
  const [isFocused, setIsFocused] = useState(false);
  const buttonRef = useRef(null);
  const medplum = useMedplum();

  if (!item.code?.coding) {
    return undefined;
  }

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget === buttonRef.current) {
      return;
    }
    setIsFocused(false);
  };

  const handleSubmit = async () => {
    const resourceItem = (await medplum.readResource('AllergyIntolerance', item.id ?? '')) as AllergyIntolerance;
    await medplum.updateResource<AllergyIntolerance>({
      ...resourceItem,
      criticality: item.criticality,
    });
  };

  return (
    <Box onBlur={handleBlur}>
      <Text>{renderCoding(item?.code?.coding)}</Text>
      <Box display="flex">
        <NativeSelect
          w={'75%'}
          id={item.id}
          name={item.id}
          defaultValue={item.criticality}
          onFocus={() => setIsFocused(true)}
          data={['low', 'high', 'unable-to-assess']}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const value = e.currentTarget.value;
            setItem((prevItem) => ({ ...prevItem, criticality: value as AllergyIntolerance['criticality'] }));
          }}
        />
        {isFocused && (
          <Button
            ref={buttonRef}
            onClick={() => {
              console.log('Button clicked!');
              handleSubmit();
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

function RenderSocialHistoryItem(props: { item: PanelData }): JSX.Element | null {
  if (!props.item.valueCodeableConcept || !props.item.valueCodeableConcept.coding) {
    return null;
  }
  return (
    <Box>
      <Text>{renderCoding(props.item?.code?.coding)}</Text>
      <CodingInput property={{ binding: { valueSet: props.item.code.coding?.[0].system } }} name="hoorah" />
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
    <Card display="flex" className={classes.descriptionCell}>
      <Card.Section
        h={100}
        style={{
          backgroundColor: 'purple',
        }}
      />
      <ResourceAvatar src={patient.photo?.[0].url} size={80} radius={80} mx="auto" mt={-30} />
      {patient.name?.[0] ? (
        <Text ta="center" fz="lg" fw={500} mt="sm">
          {formatHumanName(patient.name[0])}
        </Text>
      ) : undefined}
      <BirthdateAndAge patient={patient} />
      <DescriptionBox patient={patient} />
    </Card>
  );
}

function BirthdateAndAge(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const birthday = calculateAgeString(patient.birthDate as string);
  return (
    <Box display="flex">
      <Text ta="center" fz="sm" c="dimmed" pr={5}>
        {patient.birthDate}
      </Text>
      <Text ta="center" fz="sm" c="dimmed">{`(${birthday})`}</Text>
    </Box>
  );
}

function DescriptionBox(props: { patient: Patient }): JSX.Element {
  const patient = props.patient;
  const { classes } = useStyles();
  return (
    <Group display="flex" mt="md" grow spacing="md" w="75%" className={classes.group}>
      <Box display="flex" className={classes.descriptionCell}>
        <IconUser className={classes.subColor} />
        {patient.name?.[0] ? (
          <Text fz="xs" align="center">
            {formatHumanName(patient.name?.[0])}
          </Text>
        ) : undefined}
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

// Put into React Package
export function ValueQuantityDisplay(props: {
  item: PanelData;
  handleSubmit: (modifiedItem: PanelData) => void;
}): JSX.Element | undefined {
  const [item, setItem] = useState(props.item);
  const [isFocused, setIsFocused] = useState(false);
  const buttonRef = useRef(null);

  const handleChange = (newValue: number) => {
    setItem((prevItem) => ({ ...prevItem, valueQuantity: { ...prevItem.valueQuantity, value: newValue } }));
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget === buttonRef.current) {
      return;
    }
    setIsFocused(false);
  };

  if (!props.item?.valueQuantity) {
    return undefined;
  }
  const suffix = props.item.valueQuantity.unit ?? '';

  return (
    <Box>
      <Text>{renderCoding(props.item?.code?.coding)}</Text>
      <Box display="flex">
        <NumberInput
          w="75%"
          defaultValue={props.item.valueQuantity.value}
          onChange={(val) => handleChange(val as number)}
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
              props.handleSubmit(item);
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

// Put in Core

// use calculateAgeString
