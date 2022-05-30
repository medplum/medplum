import React from 'react';
import './FooterLinks.css';

export interface FooterLinksProps {
  children?: React.ReactNode;
}

export function FooterLinks(props: FooterLinksProps): JSX.Element {
  return <div className="medplum-footer">{props.children}</div>;
}
