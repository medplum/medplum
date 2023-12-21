import { ActionIcon, Button, Group, Stack, createStyles } from '@mantine/core';
import {
  InternalSchemaElement,
  getPathDisplayName,
  getPropertyDisplayName,
  isEmpty,
  tryGetProfile,
} from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import { MouseEvent, useEffect, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { FormSection } from '../FormSection/FormSection';
import { ElementDefinitionTypeInput, ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import {
  SupportedSliceDefinition,
  assignValuesIntoSlices,
  isSupportedSliceDefinition,
} from './ResourceArrayInput.utils';

const useStyles = createStyles((theme) => ({
  indented: {
    marginTop: '0.5rem',
    borderLeft: `3px solid ${theme.colors.gray[4]}`,
    padding: '0.5rem 0 0.5rem 0.5rem',
  },
}));

export interface ResourceArrayInputProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: any[];
  indent?: boolean;
  arrayElement?: boolean;
  outcome: OperationOutcome | undefined;
  onChange?: (value: any[]) => void;
  hideNonSliceValues?: boolean;
}

export function ResourceArrayInput(props: Readonly<ResourceArrayInputProps>): JSX.Element {
  const { property } = props;
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [slices, setSlices] = useState<SupportedSliceDefinition[]>([]);
  // props.defaultValue should NOT be used after this; prefer the defaultValue state
  const [defaultValue] = useState<any[]>(() => (Array.isArray(props.defaultValue) ? props.defaultValue : []));
  const [slicedValues, setSlicedValues] = useState<any[][]>([[]]);
  const { classes } = useStyles();

  const propertyTypeCode = property.type[0]?.code;
  useEffect(() => {
    if (!property.slicing) {
      const emptySlices: SupportedSliceDefinition[] = [];
      setSlices(emptySlices);
      const results = assignValuesIntoSlices(defaultValue, emptySlices, property.slicing);
      setSlicedValues(results);
      setLoading(false);
      return;
    }

    const supportedSlices: SupportedSliceDefinition[] = [];
    const profileUrls: (string | undefined)[] = [];
    const promises: Promise<void>[] = [];
    for (const slice of property.slicing.slices) {
      if (!isSupportedSliceDefinition(slice)) {
        continue;
      }

      const sliceType = slice.type[0];
      let profileUrl: string | undefined;
      if (isEmpty(slice.elements)) {
        if (sliceType.profile) {
          profileUrl = sliceType.profile[0];
        }
      }

      // important to keep these three arrays the same length;
      supportedSlices.push(slice);
      profileUrls.push(profileUrl);
      if (profileUrl) {
        promises.push(medplum.requestProfileSchema(profileUrl));
      } else {
        promises.push(Promise.resolve());
      }
    }

    Promise.all(promises)
      .then(() => {
        for (let i = 0; i < supportedSlices.length; i++) {
          const slice = supportedSlices[i];
          const profileUrl = profileUrls[i];
          if (profileUrl) {
            const typeSchema = tryGetProfile(profileUrl);
            slice.typeSchema = typeSchema;
          }
        }
        setSlices(supportedSlices);
        const results = assignValuesIntoSlices(defaultValue, supportedSlices, property.slicing);
        setSlicedValues(results);
        setLoading(false);
      })
      .catch((reason) => {
        console.error(reason);
        setLoading(false);
      });
  }, [medplum, property.slicing, propertyTypeCode, defaultValue]);

  function setValuesWrapper(newValues: any[], sliceIndex: number): void {
    const newSlicedValues = [...slicedValues];
    newSlicedValues[sliceIndex] = newValues;
    setSlicedValues(newSlicedValues);
    if (props.onChange) {
      // Remove any placeholder (i.e. undefined) values before propagating
      const cleaned = newSlicedValues.flat().filter((val) => val !== undefined);
      props.onChange(cleaned);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  const nonSliceIndex = slices.length;
  const nonSliceValues = slicedValues[nonSliceIndex];

  // Hide non-sliced values when handling sliced extensions
  const showNonSliceValues = !(props.hideNonSliceValues ?? (propertyTypeCode === 'Extension' && slices.length > 0));
  const propertyDisplayName = getPathDisplayName(property.path);

  return (
    <Stack className={props.indent ? classes.indented : undefined}>
      {slices.map((slice, sliceIndex) => {
        return (
          <SliceInput
            slice={slice}
            key={slice.name}
            property={property}
            defaultValue={slicedValues[sliceIndex]}
            onChange={(newValue: any[]) => {
              setValuesWrapper(newValue, sliceIndex);
            }}
            testId={`slice-${slice.name}`}
          />
        );
      })}

      {showNonSliceValues &&
        nonSliceValues.map((value, valueIndex) => (
          <Group key={`${valueIndex}-${nonSliceValues.length}`} noWrap style={{ flexGrow: 1 }}>
            <div style={{ flexGrow: 1 }}>
              <ResourcePropertyInput
                arrayElement={true}
                property={props.property}
                name={props.name + '.' + valueIndex}
                defaultValue={value}
                onChange={(newValue: any) => {
                  const newNonSliceValues = [...nonSliceValues];
                  newNonSliceValues[valueIndex] = newValue;
                  setValuesWrapper(newNonSliceValues, nonSliceIndex);
                }}
                defaultPropertyType={undefined}
                outcome={props.outcome}
              />
            </div>
            <RemoveButton
              propertyDisplayName={propertyDisplayName}
              testId={`nonsliced-remove-${valueIndex}`}
              onClick={(e: MouseEvent) => {
                killEvent(e);
                const newNonSliceValues = [...nonSliceValues];
                newNonSliceValues.splice(valueIndex, 1);
                setValuesWrapper(newNonSliceValues, nonSliceIndex);
              }}
            />
          </Group>
        ))}
      {showNonSliceValues && slicedValues.flat().length < property.max && (
        <Group noWrap style={{ justifyContent: 'flex-start' }}>
          <AddButton
            propertyDisplayName={propertyDisplayName}
            onClick={(e: MouseEvent) => {
              killEvent(e);
              const newNonSliceValues = [...nonSliceValues];
              newNonSliceValues.push(undefined);
              setValuesWrapper(newNonSliceValues, nonSliceIndex);
            }}
            testId="nonsliced-add"
          />
        </Group>
      )}
    </Stack>
  );
}

type SliceInputProps = Readonly<{
  slice: SupportedSliceDefinition;
  property: InternalSchemaElement;
  defaultValue: any[];
  onChange: (newValue: any[]) => void;
  outcome?: OperationOutcome;
  testId?: string;
}>;
function SliceInput(props: SliceInputProps): JSX.Element | null {
  const { slice, property } = props;
  const [values, setValues] = useState<any[]>(() => {
    return props.defaultValue.map((v) => v ?? {});
  });
  const { classes } = useStyles();

  function setValuesWrapper(newValues: any[]): void {
    setValues(newValues);
    if (props.onChange) {
      props.onChange(newValues);
    }
  }

  const required = slice.min > 0;

  // this is a bit of a hack targeted at nested extensions; indentation would ideally be controlled elsewhere
  // e.g. USCorePatientProfile -> USCoreEthnicityExtension -> {ombCategory, detailed, text}
  const indentedStack = isEmpty(slice.elements);
  const propertyDisplayName = getPropertyDisplayName(slice.name);
  return (
    <FormSection
      title={propertyDisplayName}
      description={slice.definition}
      withAsterisk={required}
      fhirPath={`${property.path}:${slice.name}`}
      testId={props.testId}
    >
      <Stack className={indentedStack ? classes.indented : undefined}>
        {values.map((value, valueIndex) => {
          return (
            <Group key={`${valueIndex}-${values.length}`} noWrap>
              <div style={{ flexGrow: 1 }}>
                <Stack>
                  {!isEmpty(slice.elements) ? (
                    <ElementsInput
                      type={slice.type[0].code}
                      elements={slice.elements}
                      defaultValue={value}
                      outcome={props.outcome}
                      onChange={(newValue) => {
                        const newValues = [...values];
                        newValues[valueIndex] = newValue;
                        setValuesWrapper(newValues);
                      }}
                      testId={props.testId && `${props.testId}-elements-${valueIndex}`}
                    />
                  ) : (
                    <ElementDefinitionTypeInput
                      elementDefinitionType={slice.type[0]}
                      name={slice.name}
                      defaultValue={value}
                      onChange={(newValue) => {
                        const newValues = [...values];
                        newValues[valueIndex] = newValue;
                        setValuesWrapper(newValues);
                      }}
                      outcome={undefined}
                      min={slice.min}
                      max={slice.max}
                      binding={undefined}
                      path={slice.path}
                    />
                  )}
                </Stack>
              </div>
              {values.length > slice.min && (
                <RemoveButton
                  propertyDisplayName={propertyDisplayName}
                  testId={props.testId && `${props.testId}-remove-${valueIndex}`}
                  onClick={(e: React.MouseEvent) => {
                    killEvent(e);
                    const newValues = [...values];
                    newValues.splice(valueIndex, 1);
                    setValuesWrapper(newValues);
                  }}
                />
              )}
            </Group>
          );
        })}
        {values.length < slice.max && (
          <Group noWrap style={{ justifyContent: 'flex-start' }}>
            <AddButton
              propertyDisplayName={propertyDisplayName}
              onClick={(e: React.MouseEvent) => {
                killEvent(e);
                const newValues = [...values, undefined];
                setValuesWrapper(newValues);
              }}
              testId={props.testId && `${props.testId}-add`}
            />
          </Group>
        )}
      </Stack>
    </FormSection>
  );
}

type ButtonProps = Readonly<{
  propertyDisplayName?: string;
  onClick: React.MouseEventHandler;
  testId?: string;
}>;

function AddButton({ propertyDisplayName, onClick, testId }: ButtonProps): JSX.Element {
  const text = propertyDisplayName ? `Add ${propertyDisplayName}` : 'Add';

  return propertyDisplayName ? (
    <Button
      title={text}
      size="sm"
      color="green.6"
      variant="subtle"
      data-testid={testId}
      leftIcon={<IconCirclePlus size="1.25rem" />}
      onClick={onClick}
    >
      {text}
    </Button>
  ) : (
    <ActionIcon title={text} color="green.6" data-testid={testId} onClick={onClick}>
      <IconCirclePlus size="1.25rem" />
    </ActionIcon>
  );
}

function RemoveButton({ propertyDisplayName, onClick, testId }: ButtonProps): JSX.Element {
  return (
    <ActionIcon
      title={propertyDisplayName ? `Remove ${propertyDisplayName}` : 'Remove'}
      color="red.5"
      data-testid={testId}
      onClick={onClick}
    >
      <IconCircleMinus size="1.25rem" />
    </ActionIcon>
  );
}
