import { getDisplayString, getReferenceString } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  OperationOutcome,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
} from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, TitleBar, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';
import { ResourceHeader } from './ResourceHeader';
import { getPatient } from './utils';

export function FormPage(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [subject, setSubject] = useState<Resource | undefined>();
  const [error, setError] = useState<OperationOutcome>();

  useEffect(() => {
    const requestBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'GET',
            url: `Questionnaire/${id}`,
          },
        },
      ],
    };

    if ('subject' in queryParams) {
      (requestBundle.entry as BundleEntry[]).push({
        request: {
          method: 'GET',
          url: queryParams['subject'],
        },
      });
    }

    medplum
      .post('fhir/R4', requestBundle)
      .then((bundle: Bundle) => {
        if (bundle.entry?.[0]?.response?.status !== '200') {
          setError(bundle.entry?.[0]?.response as OperationOutcome);
        } else {
          setQuestionnaire(bundle.entry?.[0]?.resource as Questionnaire);
          setSubject(bundle.entry?.[1]?.resource as Resource);
        }
        setLoading(false);
      })
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }, [id, location]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !questionnaire) {
    return <Loading />;
  }

  const patient = subject && getPatient(subject);

  return (
    <>
      {patient && <PatientHeader patient={patient} />}
      {subject && subject.resourceType !== 'Patient' && <ResourceHeader resource={subject} />}
      <TitleBar>
        <h1>{getDisplayString(questionnaire)}</h1>
      </TitleBar>
      <Document>
        <QuestionnaireForm
          questionnaire={questionnaire}
          onSubmit={(questionnaireResponse: QuestionnaireResponse) => {
            medplum.create(questionnaireResponse).then((result) => {
              navigate(`/${getReferenceString(result)}`);
            });
          }}
        />
      </Document>
    </>
  );
}
