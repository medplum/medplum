import React from 'react';
import { Logo } from './Logo';
import { useAuth } from './MedplumProvider';
import './Header.css';

export interface HeaderProps {
  onLogo?: () => void;
  onProfile?: () => void;
  onSignIn?: () => void;
  onRegister?: () => void;
}

export function Header(props: HeaderProps) {
  const auth = useAuth();
  return (
    <header>
      <div>
        <a href="#" onClick={props.onLogo}><Logo width={24} height={24} />Medplum</a>
      </div>
      <div>
        {auth.user ? (
          <a href="#" onClick={props.onProfile}>Profile</a>
        ) : (
          <>
            <a href="#" onClick={props.onSignIn}>Sign in</a>
            <a href="#" onClick={props.onRegister}>Register</a>
          </>
        )}
      </div>
    </header>
  );
}