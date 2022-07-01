import React from 'react';
import './CheckboxFormSection.css';

export interface CheckboxFormSectionProps {
  htmlFor?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function CheckboxFormSection(props: CheckboxFormSectionProps): JSX.Element {
  // const issues = getIssuesForExpression(props.outcome, props.htmlFor);
  // const invalid = issues && issues.length > 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ width: 30 }}>
        {/* <ResourcePropertyInput
          property={property}
          name={key}
          defaultValue={propertyValue}
          defaultPropertyType={propertyType}
          outcome={props.outcome}
          onChange={(newValue: any, propName?: string) => {
            setValueWrapper(setPropertyValue(value, key, propName ?? key, entry[1], newValue));
          }}
        /> */}
        {props.children}
      </div>
      <div style={{ flex: 1, width: '100%' }}>
        <label style={{ fontWeight: 500 }} htmlFor={props.htmlFor}>
          {props.title}
        </label>
        <p>{props.description}</p>
      </div>
    </div>
  );
}
