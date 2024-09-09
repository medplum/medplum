import { ContactDetail } from '@medplum/fhirtypes';
import { ContactPointDisplay } from '../ContactPointDisplay/ContactPointDisplay';

export interface ContactDetailDisplayProps {
  readonly value?: ContactDetail;
}

export function ContactDetailDisplay(props: ContactDetailDisplayProps): JSX.Element | null {
  const contactDetail = props.value;
  if (!contactDetail) {
    return null;
  }

  return (
    <>
      {contactDetail.name}
      {contactDetail.name && ': '}
      {contactDetail.telecom?.map((telecom) => (
        <ContactPointDisplay key={`telecom-${contactDetail.name}-${telecom.value}`} value={telecom} />
      ))}
    </>
  );
}
