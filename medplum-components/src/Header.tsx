import React from 'react';
import { Button } from './Button';
import { Logo } from './Logo';
import './Header.css';

export interface HeaderProps {
  user?: {};
  onLogin: () => void;
  onLogout: () => void;
  onCreateAccount: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogin, onLogout, onCreateAccount }) => (
  <header>
    <div>
      <a href="#"><Logo width={24} height={24} /></a>
      <a href="#">MedPlum</a>
    </div>
    <div>
      {user ? (
        <Button size="small" onClick={onLogout}>Log out</Button>
      ) : (
        <>
          <Button size="small" onClick={onLogin}>Log in</Button>
          <Button primary size="small" onClick={onCreateAccount}>Sign up</Button>
        </>
      )}
    </div>
  </header>
);
