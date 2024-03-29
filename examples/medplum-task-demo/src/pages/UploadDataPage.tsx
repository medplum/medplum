import { Button } from '@mantine/core';
import { MedplumClient, capitalize, isOk, normalizeErrorString } from '@medplum/core';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { useParams, useNavigate } from 'react-router-dom';

import { showNotification } from '@mantine/notifications';
import { Bundle, Coding, Practitioner, ValueSet } from '@medplum/fhirtypes';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import businessStatusValueSet from '../../data/core/business-status-valueset.json';
import practitionerRoleValueSet from '../../data/core/practitioner-role-valueset.json';
import taskTypeValueSet from '../../data/core/task-type-valueset.json';
import exampleMessageData from '../../data/example/example-messages.json';
import exampleReportData from '../../data/example/example-reports.json';
import exampleTaskData from '../../data/example/example-tasks.json';

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { dataType } = useParams();
  const navigate = useNavigate();
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);

  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleUpload = useCallback(() => {
    setButtonDisabled(true);
    let uploadFunction: (medplum: MedplumClient, profile?: Practitioner) => Promise<void>;
    switch (dataType) {
      case 'core':
        uploadFunction = uploadCoreData;
        break;
      case 'task':
        uploadFunction = uploadExampleTaskData;
        break;
      case 'message':
        uploadFunction = uploadExampleMessageData;
        break;
      case 'report':
        uploadFunction = uploadExampleReportData;
        break;
      case 'qualifications':
        uploadFunction = uploadExampleQualifications;
        break;
      default:
        throw new Error(`Invalid upload type '${dataType}'`);
    }

    uploadFunction(medplum, profile as Practitioner)
      .then(() => navigate(-1))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setButtonDisabled(false));
  }, [medplum, profile, dataType, navigate]);

  return (
    <Document>
      <Button disabled={buttonDisabled} onClick={handleUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  // Upload all the core ValueSets in a single batch request
  const valueSets: ValueSet[] = [
    businessStatusValueSet as ValueSet,
    taskTypeValueSet as ValueSet,
    practitionerRoleValueSet as ValueSet,
  ];

  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: valueSets.map((valueSet) => ({
      request: { method: 'POST', url: valueSet.resourceType, ifNoneExist: `url=${valueSet.url}` },
      resource: valueSet,
    })),
  });

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Business Statuses',
  });

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Business Statuses',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading core data');
  }
}

async function uploadExampleMessageData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleMessageData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Messages',
  });
}

async function uploadExampleReportData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleReportData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Report',
  });
}

async function uploadExampleTaskData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleTaskData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Tasks',
  });
}

async function uploadExampleQualifications(medplum: MedplumClient, profile?: Practitioner): Promise<void> {
  if (!profile) {
    return;
  }

  const states: Coding[] = [
    { code: 'NY', display: 'State of New York', system: 'https://www.usps.com/' },
    { code: 'CA', display: 'State of California', system: 'https://www.usps.com/' },
    { code: 'TX', display: 'State of Texas', system: 'https://www.usps.com/' },
  ];

  await medplum.patchResource(profile.resourceType, profile.id as string, [
    {
      path: '/qualification',
      op: 'replace',
      value: states.map((state) => ({
        code: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
              code: 'MD',
            },
          ],
          text: 'MD',
        },
        // Medical License Issuer: State of New York
        issuer: {
          display: state.display,
        },
        // Extension: Medical License Valid in NY
        extension: [
          {
            url: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
            extension: [
              {
                url: 'whereValid',
                valueCodeableConcept: {
                  coding: [state],
                },
              },
            ],
          },
        ],
      })),
    },
  ]);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Qualifications',
  });
}
