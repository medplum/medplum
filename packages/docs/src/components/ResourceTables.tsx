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
              {property.types?.[0] === 'BackboneElement'
                ? buildTypeName(property.path.split('.'))
                : property.types.join(', ')}
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
