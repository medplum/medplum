# Matching Rules {#matching-rules}

The best deduplication systems use a library of matching rules with different strengths and weaknesses. While the effectiveness of different patient matching rules will vary depending on the clinical context, here we suggest some rules to get you started.

These have been trialed in previous deduplication projects, and are rated by their false positive rates (i.e. incorrect matches) and false negative rates (i.e. missed matches). Note that three matching identifiers is the standard.

1. **Exact match on email address / phone number, name, gender, and date of birth:** We recommend starting here. Email and phone act as pseudo-unique identifiers, and have a very low false positive rate. Using name, gender, and date of birth help eliminate false positives caused by family members sharing the same contact info. Note that phone numbers should be normalized before use.
2. **Exact match on first name, last name, date of birth, and postal code:** These matches have a high probability of being true positives, and can be used without email or phone number. Note that false positives can still occur, and we recommend human review of these matches.
3. **Phonetic match first match on first and last name, date of birth, and postal code:** Phonetic matching algorithms such as [Soundex](https://en.wikipedia.org/wiki/Soundex) or [Metaphone](https://en.wikipedia.org/wiki/Metaphone) can be used to increase the match rate on names and accounts for transcription error. Additionally, setting a threshold on the [edit distance](https://en.wikipedia.org/wiki/Levenshtein_distance) between the names can help accommodate misspellings.
4. **Phonetic match first name, date of birth:** This rule excludes last names, to account for patients who have changed their surnames (e.g. after getting married). It also excludes address information to account for patients who move. While this rule will catch more matches, it has a significantly higher false positive rate, and should definitely be coupled with human review.
5. **Machine Learning:** After you have built up a dataset of matching patient pairs that have been reviewed by a human, you are in a good position to train a machine learning model. The most common setup is to treat this as a [binary classification problem](https://www.learndatasci.com/glossary/binary-classification) that outputs a match/no-match decision for a candidate (patient, patient) pair, and then use your [merge rules](#merge-rules) to convert these pairs into a single master record.

## Representing Matches with a `RiskAssessment` Resource

The likelihood of a candidate being a match can be represented by a `RiskAssessment` resource. This allows you to classify how likely the match is, what was matched, and more.

| Element              | Description                                                                                   | Example               |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| `probabilityDecimal` | The probability of a match, as a percent.                                                     | 85                    |
| `qualitativeRisk`    | A readable description of how likely the match is.                                            | Very likely           |
| `method`             | The rule or technique that was used to create the assessment.                                 | last-name             |
| `code`               | Indicates what is being assessed. When deduping records, it will always be a duplicate match. | duplicate-patient     |
| `subject`            | The patient or other resource that a potential match is being checked against.                | Patient/homer-simpson |
| `basis`              | The patient or other resource that could be a potential match for the subject.                | Patient/marge-simpson |

<details><summary>A `RiskAssessment` for a potential duped patient record</summary>
```js
{
  resourceType: RiskAssessment,
  id: 'homer-simpson-match-risk-assessment'
  subject: {
    resource: {
      resourceType: 'Patient',
      id: 'homer-simpson'
    },
  },
  basis: {
    resource: {
      resourceType: 'Patient',
      id: 'marge-simpson',
    },
  },
  code: {
    coding: [
      {
        system: 'http://example.org/risk-assessment-type',
        code: 'duplicate-patient',
      },
    ],
  },
  method: {
    coding: [
      {
        system: 'http://example.org/dedupe-method',
        code: 'last-name',
      },
    ],
  },
  prediction: [
    {
      probabilityDecimal: 50,
      qualitativeRisk: {
        text: 'Somewhat likely',
      },
    },
  ],
}
```
</details>

## Do Not Match Lists

To ensure that certain records are _not_ matched, you can create a Do Not Match List for a patient. This should be represented as a `List` resource, with the patient stored in the `subject` field. Any other patients that should not be matched to this patient can be stored as an `entry`.

<details><summary>A patient's Do Not Match `List`</summary>
```js
{
  resourceType: 'List',
  id: 'homer-simpson-do-not-match-list',
  subject: {
    resource: {
      resourceType: 'Patient',
      id: 'homer-simpson',
    },
  },
  entry: [
    {
      id: 'do-not-match-entry-1',
      item: {
        resource: {
          resourceType: 'Patient',
          id: 'marge-simpson',
        },
      },
    },
    {
      id: 'do-not-match-entry-2',
      item: {
        resource: {
          resourceType: 'Patient',
          id: 'lisa-simpson',
        },
      },
    },
  ],
}
```
</details>
