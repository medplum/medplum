// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block editorImports
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { saveResponse } from './saving-responses';
// end-block editorImports

// start-block editor
export function SavedQuestionnaireForm(props: {
  questionnaire: Questionnaire;
  response: QuestionnaireResponse;
  validateResponse: (response: QuestionnaireResponse) => void | Promise<void>;
}): JSX.Element {
  const medplum = useMedplum();
  const [saved, setSaved] = useState(props.response);
  const [initialResponse] = useState(() => deepClone(props.response));
  const latest = useRef<QuestionnaireResponse>(initialResponse);
  const initialized = useRef(false);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function persist(response: QuestionnaireResponse): Promise<void> {
    if (saving.current) {
      // The fieldset disables UI actions; this guard also prevents overlapping calls.
      return;
    }
    const snapshot = deepClone(response);
    saving.current = true;
    setBusy(true);
    setMessage('Saving...');
    try {
      if (snapshot.status === 'completed') {
        await props.validateResponse(snapshot);
      }
      const result = await saveResponse(medplum, saved, snapshot);
      setSaved(result);
      setMessage(result.status === 'completed' ? 'Response submitted.' : 'Draft saved.');
    } catch (error) {
      if (normalizeOperationOutcome(error).id === 'precondition-failed') {
        setMessage(
          'This response changed elsewhere. Preserve your edits, then reload the latest response before saving again.'
        );
      } else {
        setMessage(`Save failed: ${normalizeErrorString(error)}. Your edits remain open.`);
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {saved.status === 'in-progress' && (
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <QuestionnaireForm
            questionnaire={props.questionnaire}
            questionnaireResponse={initialResponse}
            subject={saved.subject}
            encounter={saved.encounter}
            source={saved.source}
            onChange={(response) => {
              latest.current = deepClone(response);
              if (initialized.current) {
                setMessage('Unsaved changes.');
              }
              initialized.current = true;
            }}
            onSubmit={(response) => {
              persist(response).catch(console.error);
            }}
          />
          <button
            type="button"
            onClick={() => {
              persist({ ...latest.current, status: 'in-progress' }).catch(console.error);
            }}
          >
            Save draft
          </button>
        </fieldset>
      )}
      <p role="status">{message || (saved.status !== 'in-progress' ? 'This response is closed for editing.' : '')}</p>
    </>
  );
}
// end-block editor
