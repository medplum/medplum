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
      <a href="#"><Logo width={24} height={24} />MedPlum</a>
    </div>
    <div>
      {user ? (
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
