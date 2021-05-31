import React from 'react';
import { useMedplumRouter } from "./MedplumProvider";


export interface MedplumLinkProps {
  to: string;
  children: React.ReactNode;
}

export function MedplumLink(props: MedplumLinkProps) {
  const router = useMedplumRouter();
  return (
    <a
      href={props.to}
      onClick={(e: React.SyntheticEvent) => {
        e.preventDefault();
        router.push(props.to);
      }}
    >{props.children}</a>
  );
}
