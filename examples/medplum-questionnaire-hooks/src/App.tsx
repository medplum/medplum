import { QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useQuestionnaireForm } from '@medplum/react-hooks';
import { useState } from 'react';
import { PagedQuestionnaire } from './questionnaire';

export function App() {
  const [result, setResult] = useState<QuestionnaireResponse>();

  const formState = useQuestionnaireForm({
    questionnaire: PagedQuestionnaire,
  });

  if (formState.loading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <h1>
        Medplum <code>useQuestionnaireForm</code> Demo
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setResult(formState.questionnaireResponse);
        }}
      >
        {formState.pagination && (
          <>
            <h2>Pages</h2>
            <ul>
              {formState.pages.map((page, index) => (
                <li key={page.linkId}>
                  {page.title} {index === formState.activePage ? ' (current)' : ''}
                </li>
              ))}
            </ul>
          </>
        )}
        {formState.items.map((group) =>
          group.item?.map((item) => (
            <fieldset key={item.linkId}>
              <legend>
                <label htmlFor={item.linkId}>
                  {item.text} {item.required && '*'}
                </label>
              </legend>
              <input
                type="text"
                id={item.linkId}
                name={item.linkId}
                required={item.required}
                onChange={(e) =>
                  formState.onChangeAnswer(
                    [
                      formState.questionnaireResponse.item?.find(
                        (i) => i.linkId === group.linkId
                      ) as QuestionnaireResponseItem,
                    ],
                    item,
                    [{ valueString: e.currentTarget.value }]
                  )
                }
              />
            </fieldset>
          ))
        )}
        {formState.pagination && (
          <div>
            <button type="button" onClick={formState.onPrevPage} disabled={formState.activePage === 0}>
              Previous
            </button>
            <button
              type="button"
              onClick={(e) => {
                const form = e.currentTarget.closest('form') as HTMLFormElement;
                if (form.reportValidity()) {
                  formState.onNextPage();
                }
              }}
              disabled={formState.activePage === formState.pages.length - 1}
            >
              Next
            </button>
            <button type="submit" disabled={formState.activePage !== formState.pages.length - 1}>
              Submit
            </button>
          </div>
        )}
      </form>
      {result && (
        <div>
          <h2>Result</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </>
  );
}
