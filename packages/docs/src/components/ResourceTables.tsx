import { buildTypeName } from '@medplum/core';
import styles from './ResourceTables.module.css';

import {
  DocumentationLocation,
  PropertyDocInfo,
  PropertyTypeDocInfo,
  SearchParamDocInfo,
} from '../types/documentationTypes';

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
            <td className={styles.propertyNameColumn}>
              {property.depth > 1 ? (
                <span
                  className={styles.indentation}
                  style={{ marginLeft: `calc(${property.depth - 1} * 1.5rem)` }}
                ></span>
              ) : (
                ''
              )}

              <span style={property.name.length > 20 ? { fontSize: 'calc(0.85 * 14px)' } : {}}>{property.name}</span>
            </td>
            <td className={styles.required}>{property.min > 0 ? '✓' : ''}</td>
            <td>
              {renderPropertyTypes(property)}
              {property.max === '*' ? '[]' : ''}
            </td>
            <td>
              <p>{property.short}</p>
              <details open={false}>
                <summary>Details</summary>
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
  if (!searchParams || searchParams.length === 0) {
    return <em>None</em>;
  }
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
  if (types[0].datatype === 'BackboneElement') {
    return <>{buildTypeName(property.path.split('.'))}</>;
  }

  return (
    <span key={`row-${property.path}`} style={{ whiteSpace: 'pre-wrap' }}>
      {property.types
        .map((t) => (t.datatype === 'Reference' ? renderReferenceType(property.referenceTypes || []) : getTypeLink(t)))
        .map((type, i, allTypes) => (
          <span className={styles.propertyTypeColumn} key={`${property.path}-type-${i}`}>
            {type}
            {i < allTypes.length - 1 ? ', ' : ''}
          </span>
        ))}
    </span>
  );
}

function renderReferenceType(referenceTypes: PropertyTypeDocInfo[]): JSX.Element {
  const verticalizeLinks = referenceTypes.length > 2;
  const separator = (i: number): string => {
    if (i < referenceTypes.length - 1) {
      if (referenceTypes && verticalizeLinks) {
        return '\n |  ';
      }
      return ' | ';
    }
    return verticalizeLinks ? '\n' : '';
  };
  return (
    <>
      <span>Reference&lt;</span>
      {referenceTypes.map((refType, i) => (
        <>
          {getTypeLink(refType, `${i === 0 && verticalizeLinks ? '\n  ' : ''}${refType.datatype}`)}
          <span key={`reference-separator-${refType.datatype}`}>{separator(i)}</span>
        </>
      ))}
      <span>&gt;</span>
    </>
  );
}

function getTypeLink(type: PropertyTypeDocInfo, linkText?: string): JSX.Element {
  linkText = linkText || type.datatype;
  if (type.documentLocation) {
    return (
      <a
        key={type.datatype}
        href={`../${pluralize(type.documentLocation).toLowerCase()}/${type.datatype.toLowerCase()}`}
      >
        {linkText}
      </a>
    );
  }
  return <>{linkText}</>;
}

function pluralize(location: DocumentationLocation): string {
  if (location !== 'medplum' && location.endsWith('e')) {
    return `${location}s`;
  }
  return location;
}
