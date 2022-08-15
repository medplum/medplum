import React from 'react';

import styles from './ResourceTables.module.css';
import { buildTypeName } from '@medplum/core';

import { PropertyDocInfo, SearchParamDocInfo } from '../types/documentationTypes';

export function ResourcePropertiesTable(props: { properties: PropertyDocInfo[] }): JSX.Element {
  let { properties } = props;
  properties = properties.filter((p) => p.depth > 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Required</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {properties.map((property) => (
          <tr key={property.path}>
            <td style={{ whiteSpace: 'nowrap' }}>
              {property.depth > 1 ? (
                <span
                  className={styles.indentation}
                  style={{ marginLeft: `calc(${property.depth - 1} * 1.5rem)` }}
                ></span>
              ) : (
                ''
              )}

              <span>{property.name}</span>
            </td>
            <td>{property.min > 0 ? 'Y' : ''}</td>
            <td>
              {renderPropertyTypes(property)}
              {property.max === '*' ? '[]' : ''}
            </td>
            <td>
              <p>{property.short}</p>
              <details open={false}>
                <summary>See More</summary>
                <p>{property.definition}</p>
                <p>{property.comment}</p>
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SearchParamsTable(props: { searchParams: SearchParamDocInfo[] }): JSX.Element {
  const searchParams = props.searchParams;
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Description</th>
          <th>Expression</th>
        </tr>
      </thead>
      <tbody>
        {searchParams.map((param) => (
          <tr key={param.name}>
            <td>{param.name}</td>
            <td>{param.type}</td>
            <td>{param.description}</td>
            <td>{param.expression}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderPropertyTypes(property: PropertyDocInfo): JSX.Element {
  const types = property.types;
  if (types?.[0] === 'BackboneElement') {
    return <>{buildTypeName(property.path.split('.'))}</>;
  }

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {property.types
        .map((t) => (t === 'Reference' ? renderReferenceType(property.referenceTypes || []) : t))
        .map((type, i, allType) => (
          <>
            {type}
            {i < allType.length - 1 ? ', ' : ''}
          </>
        ))}
    </span>
  );
}

function renderReferenceType(referenceTypes: string[]): JSX.Element {
  const verticalizeLinks = referenceTypes.length > 2;
  const separator = (i: number): string => {
    if (i < referenceTypes.length - 1) {
      if (referenceTypes && verticalizeLinks) {
        return ' |\n  ';
      }
      return ' | ';
    }
    return verticalizeLinks ? '\n' : '';
  };
  return (
    <>
      Reference&lt;
      {referenceTypes?.map((refType, i) => (
        <>
          {i === 0 && verticalizeLinks ? '\n  ' : ''}
          {<a href={`./${refType}`}>{refType}</a>} {separator(i)}
        </>
      ))}
      &gt;
    </>
  );
}
