import { Table } from '@mantine/core';
import { capitalize, formatRange, sortStringArray } from '@medplum/core';
import { ObservationDefinition, ObservationDefinitionQualifiedInterval } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Loading, RangeDisplay, useSearchResources } from '@medplum/react';
import { Fragment } from 'react';

export function AssaysPage(): JSX.Element {
  const [assays] = useSearchResources('ObservationDefinition', '_count=100');

  if (!assays) {
    return <Loading />;
  }

  return (
    <Table withTableBorder withRowBorders withColumnBorders>
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
    </Table>
  );
}

interface IntervalsDisplayProps {
  readonly ranges: ObservationDefinitionQualifiedInterval[] | undefined;
}

function IntervalsDisplay(props: IntervalsDisplayProps): JSX.Element | null {
  const { ranges } = props;
  if (!ranges) {
    return null;
  }

  const genders = getUnique(ranges.map((r) => r.gender));
  if (genders.length > 1) {
    sortStringArray(genders);
    return (
      <>
        {genders.map((gender) => (
          <Fragment key={gender}>
            <div>
              <strong>{capitalize(gender)}</strong>
            </div>
            <IntervalsDisplay ranges={props.ranges?.filter((r) => r.gender === gender)} />
          </Fragment>
        ))}
      </>
    );
  }

  const ages = getUnique(ranges.map((r) => r.age && formatRange(r.age)));
  if (ages.length > 1) {
    sortStringArray(ages);
    return (
      <>
        {ages.map((age) => (
          <Fragment key={age}>
            <div>
              <strong>{capitalize(age)}</strong>
            </div>
            <IntervalsDisplay ranges={props.ranges?.filter((r) => formatRange(r.age) === age)} />
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {ranges.map((range: ObservationDefinitionQualifiedInterval) => (
        <table key={`range-${range.condition}`}>
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
