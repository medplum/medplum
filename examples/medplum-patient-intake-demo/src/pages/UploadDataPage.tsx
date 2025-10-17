// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, isOk, normalizeErrorString } from '@medplum/core';
import type { MedplumClient, WithId } from '@medplum/core';
import type { Bundle, Practitioner, Questionnaire } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useContext, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

import patientIntakeQuestionnaireFullSdcData from '../../data/core/patient-intake-questionnaire-full-sdc.json';
import valuesetsData from '../../data/core/valuesets.json';
import exampleData from '../../data/example/example-organization-data.json';

import { IntakeQuestionnaireContext } from '../Questionnaire.context';

type UploadFunction = (
  medplum: MedplumClient,
  profile: Practitioner,
  questionnaire: WithId<Questionnaire>
) => Promise<void>;

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { questionnaire } = useContext(IntakeQuestionnaireContext);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleUpload = useCallback(() => {
    if (!profile) {
      return;
    }

    setPageDisabled(true);
    let uploadFunction: UploadFunction;
    switch (dataType) {
      case 'core':
        uploadFunction = uploadCoreData;
        break;
      case 'questionnaire':
        uploadFunction = uploadQuestionnaires;
        break;
      case 'example':
        uploadFunction = uploadExampleData;
        break;
      default:
        throw new Error(`Invalid upload type: ${dataType}`);
    }

    uploadFunction(medplum, profile as Practitioner, questionnaire as WithId<Questionnaire>)
      .then(() => navigate('/'))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setPageDisabled(false));
  }, [medplum, profile, questionnaire, dataType, navigate]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button onClick={handleUpload}>
        Upload {dataTypeDisplay} data
      </Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  const batch = valuesetsData as Bundle;
  const result = await medplum.executeBatch(batch);

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Core Data',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading core data');
  }
}

async function uploadQuestionnaires(medplum: MedplumClient): Promise<void> {
  const batch = patientIntakeQuestionnaireFullSdcData as Bundle;
  const result = await medplum.executeBatch(batch);

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Questionnaire Data',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading questionnaire data');
  }
}

async function uploadExampleData(medplum: MedplumClient): Promise<void> {
  const batch = exampleData as Bundle;
  const result = await medplum.executeBatch(batch);

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Example Data',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading example data');
  }
}
