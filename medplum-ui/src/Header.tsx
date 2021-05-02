import React from 'react';
import { Logo } from './Logo';
import { useAuth } from './MedPlumProvider';
import './Header.css';

export interface HeaderProps {
  onLogin: () => void;
  onLogout: () => void;
  onCreateAccount: () => void;
}

export function Header(props: HeaderProps) {
  const auth = useAuth();
  return (
    <header>
      <div>
        <a href="#"><Logo width={24} height={24} />MedPlum</a>
      </div>
      <div>
        {auth.user ? (
          <a href="#">Profile</a>
        ) : (
          <>
            <a href="#">Login</a>
            <a href="#">Register</a>
          </>
        )}
      </div>
    </header>
  );
}