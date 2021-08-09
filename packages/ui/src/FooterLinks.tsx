import React from 'react';
import './FooterLinks.css';

export interface FooterLinksProps {
  children?: React.ReactNode;
}

export function FooterLinks(props: FooterLinksProps) {
  return (
    <div className="medplum-footer">
      {props.children}
    </div>
  );
}
