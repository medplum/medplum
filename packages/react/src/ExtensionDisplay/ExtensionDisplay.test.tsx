import { HTTP_HL7_ORG, loadDataType, tryGetProfile } from '@medplum/core';
import { act, render, screen } from '../test-utils/render';
import { ExtensionDisplay, ExtensionDisplayProps } from './ExtensionDisplay';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { readJson } from '@medplum/definitions';
import { StructureDefinition } from '@medplum/fhirtypes';

const medplum = new MockClient();

const defaultProps: ExtensionDisplayProps = {
  value: undefined,
  path: 'Resource.extension',
  elementDefinitionType: { code: 'Extension', profile: [] },
};

describe('ExtensionDisplay', () => {
  async function setup(props: ExtensionDisplayProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ExtensionDisplay {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Renders simple value', async () => {
    // const extensionType = getDataType('Extension');
    // extensionType.elements['value[x]'];

    await setup({
      ...defaultProps,
      value: { url: 'https://example.com', valueString: 'extension str value' },
    });
    expect(screen.getByText('extension str value')).toBeInTheDocument();
  });

  test('Renders with extension profile', async () => {
    const USCoreStructureDefinitions: StructureDefinition[] = readJson(
      'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json'
    );
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const profilesToLoad = [profileUrl, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`];
    for (const url of profilesToLoad) {
      const sd = USCoreStructureDefinitions.find((sd) => sd.url === url);
      if (!sd) {
        fail(`could not find structure definition for ${url}`);
      }
      loadDataType(sd, sd.url);
    }
    const schema = tryGetProfile(profileUrl);
    const slice = schema?.elements['extension'].slicing?.slices.find((slice) => slice.name === 'race');
    if (!slice) {
      fail('Expected to find race slice');
    }

    const value = {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      extension: [
        {
          url: 'ombCategory',
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2076-8',
            display: 'Native Hawaiian or Other Pacific Islander',
          },
        },
        {
          url: 'detailed',
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '1006-6',
            display: 'Abenaki',
          },
        },
        {
          url: 'detailed',
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '1011-6',
            display: 'Chiricahua',
          },
        },
        {
          url: 'text',
          valueString: 'Race text entry',
        },
      ],
    };
    await setup({
      ...defaultProps,
      value,
      elementDefinitionType: slice?.type?.[0],
    });
    expect(screen.getByText('OMB Category')).toBeInTheDocument();
    expect(screen.getByText('Native Hawaiian or Other Pacific Islander')).toBeInTheDocument();
    expect(screen.getByText('Detailed')).toBeInTheDocument();
    expect(screen.getByText('Abenaki')).toBeInTheDocument();
    expect(screen.getByText('Chiricahua')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Race text entry')).toBeInTheDocument();
  });
});
