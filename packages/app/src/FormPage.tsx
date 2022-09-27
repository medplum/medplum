import { createReference, getDisplayString, getReferenceString } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  OperationOutcome,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
} from '@medplum/fhirtypes';
import { Document, MedplumLink, QuestionnaireForm, TitleBar, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Loading } from './components/Loading';
import { PatientHeader } from './components/PatientHeader';
import { ResourceHeader } from './components/ResourceHeader';
import { getPatient } from './utils';

export function FormPage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const subjectParam = queryParams.subject;
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [subjectList, setSubjectList] = useState<string[] | undefined>();
  const [subject, setSubject] = useState<Resource | undefined>();
  const [error, setError] = useState<OperationOutcome>();
  const [result, setResult] = useState<QuestionnaireResponse[] | undefined>();

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

    if (subjectParam) {
      const subjectIds = subjectParam.split(',').filter((e) => !!e);
      if (subjectIds.length === 1) {
        (requestBundle.entry as BundleEntry[]).push({
          request: {
            method: 'GET',
            url: subjectIds[0],
          },
        });
      }
      setSubjectList(subjectIds);
    }

    medplum
      .executeBatch(requestBundle)
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
  }, [medplum, id, subjectParam]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (result) {
    return (
      <Document>
        <h1>{questionnaire?.title}</h1>
        <p>Your response has been recorded.</p>
        <ul>
          {result.length === 1 && (
            <li>
              <MedplumLink to={result[0]}>Review your answers</MedplumLink>
            </li>
          )}
          {result.length > 1 && (
            <li>
              Review your answers:
              <ul>
                {result.map((response) => (
                  <li>
                    <MedplumLink to={response}>{getReferenceString(response)}</MedplumLink>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {subject && (
            <li>
              <MedplumLink to={subject}>Back to&nbsp;{getDisplayString(subject)}</MedplumLink>
            </li>
          )}
          <li>
            <MedplumLink to="/">Go back home</MedplumLink>
          </li>
        </ul>
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
        <h1>
          {getDisplayString(questionnaire)}
          {subjectList && subjectList.length > 1 && <>&nbsp;(for {subjectList.length} resources)</>}
        </h1>
      </TitleBar>
      <Document>
        <QuestionnaireForm
          questionnaire={questionnaire}
          subject={subject && createReference(subject)}
          onSubmit={handleSubmit}
        />
      </Document>
    </>
  );

  async function handleSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    const responses = [] as QuestionnaireResponse[];

    if (!subjectList || subjectList.length === 0) {
      // If there is no subject, then simply submit the questionnaire response.
      responses.push(await medplum.createResource(questionnaireResponse));
    } else {
      // Otherwise submit one questionnaire response for each subject ID.
      for (const subjectId of subjectList) {
        responses.push(
          await medplum.createResource({
            ...questionnaireResponse,
            subject: { reference: subjectId },
          })
        );
      }
    }

    setResult(responses);
  }
}
