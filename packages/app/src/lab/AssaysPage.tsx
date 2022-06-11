import { capitalize } from '@medplum/core';
import { ObservationDefinition, ObservationDefinitionQualifiedInterval } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, formatRangeString, RangeDisplay, useMedplum } from '@medplum/react';
import React from 'react';

export function AssaysPage(): JSX.Element {
  const medplum = useMedplum();
  const assays = medplum.searchResources('ObservationDefinition', '_count=100').read();

  return (
    <table className="medplum-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Code</th>
          <th>Method</th>
          <th>Unit</th>
          <th>Precision</th>
          <th>Ranges</th>
        </tr>
      </thead>
      <tbody>
        {assays.map((assay: ObservationDefinition) => (
          <tr key={assay.id}>
            <td>
              <CodeableConceptDisplay value={assay.category?.[0]} />
            </td>
            <td>
              <CodeableConceptDisplay value={assay.code} />
            </td>
            <td>
              <CodeableConceptDisplay value={assay.method} />
            </td>
            <td>{assay.quantitativeDetails?.unit?.text}</td>
            <td>{assay.quantitativeDetails?.decimalPrecision}</td>
            <td>
              <IntervalsDisplay ranges={assay.qualifiedInterval} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface IntervalsDisplayProps {
  ranges: ObservationDefinitionQualifiedInterval[] | undefined;
}

function IntervalsDisplay(props: IntervalsDisplayProps): JSX.Element | null {
  const { ranges } = props;
  if (!ranges) {
    return null;
  }

  const genders = getUnique(ranges.map((r) => r.gender));
  if (genders.length > 1) {
    genders.sort();
    return (
      <>
        {genders.map((gender) => (
          <>
            <div>
              <strong>{capitalize(gender)}</strong>
            </div>
            <IntervalsDisplay ranges={props.ranges?.filter((r) => r.gender === gender)} />
          </>
        ))}
      </>
    );
  }

  const ages = getUnique(ranges.map((r) => r.age && formatRangeString(r.age)));
  if (ages.length > 1) {
    ages.sort();
    return (
      <>
        {ages.map((age) => (
          <>
            <div>
              <strong>{capitalize(age)}</strong>
            </div>
            <IntervalsDisplay ranges={props.ranges?.filter((r) => formatRangeString(r.age) === age)} />
          </>
        ))}
      </>
    );
  }

  return (
    <>
      {ranges.map((range: ObservationDefinitionQualifiedInterval) => (
        <table>
          <tbody>
            <tr>
              <td>{range.condition}</td>
              <td>
                <RangeDisplay value={range.range} />
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  );
}

function getUnique(arr: (string | undefined)[]): string[] {
  return [...new Set<string>(arr.filter((e) => !!e) as string[])];
}
