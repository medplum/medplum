import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ReferenceInput } from '../ReferenceInput';

export default {
  title: 'Medplum/ReferenceInput',
  component: ReferenceInput,
} as Meta;

// const targetProfile = props.property.type?.[0]?.targetProfile;

export const Patient = () => (
  <Document>
    <ReferenceInput
      // id="foo"
      // resourceType="Patient"
      name="foo"
      // loadOptions={async (input: string) => presidents.filter(s => s.toLowerCase().includes(input.toLowerCase()))}
      // getId={(option: string) => option}
      // getDisplay={(option: string) => (
      //   <div>{option}</div>
      // )}
      property={{
        type: [{
          targetProfile: ['Practitioner', 'Patient']
        }]
      }}
    />
  </Document>
);

// export const Multiple = () => (
//   <Document>
//     <ReferenceInput id="foo" resourceType="Patient" multiple={true} />
//   </Document>
// );

// export const Prefilled = () => (
//   <Document>
//     <ReferenceInput
//       resourceType="Patient"
//       id={process.env.SAMPLE_PATIENT_ID}
//       defaultValue={[{
//         reference: 'Patient/' + process.env.SAMPLE_PATIENT_ID
//       }]}
//     />
//   </Document>
// );
