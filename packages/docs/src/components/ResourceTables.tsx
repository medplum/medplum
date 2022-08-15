import React from 'react';

import styles from './ResourceTables.module.css';
import { buildTypeName } from '@medplum/core';
import { PropertyDocInfo } from '../types/documentationTypes';

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
          <th>Card</th>
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
              {property.type === 'BackboneElement' ? buildTypeName(property.path.split('.')) : property.type}
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
            <td>
              {property.min}...{property.max}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
