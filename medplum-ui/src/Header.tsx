import React, { useState } from 'react';
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
  const [searchHintsVisible, setSearchHintsVisible] = useState(false);
  return (
    <header>
      <div>
        <a href="#" onClick={props.onLogo}><Logo width={24} height={24} />Medplum</a>
        <div className="medplum-nav-search-container">
          <input
            name="q"
            type="text"
            placeholder="Search..."
            autoComplete="off"
            maxLength={240}
            className="medplum-nav-search-input"
            onFocus={() => setSearchHintsVisible(true)}
            onBlur={() => setSearchHintsVisible(false)}
          />
          <svg aria-hidden="true" className="medplum-nav-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M18 16.5l-5.14-5.18h-.35a7 7 0 10-1.19 1.19v.35L16.5 18l1.5-1.5zM12 7A5 5 0 112 7a5 5 0 0110 0z" />
          </svg>
          {searchHintsVisible && (
            <div className="medplum-nav-search-popover" role="menu">
              <div className="medplum-nav-search-hints">
                <div className="medplum-nav-search-hints-column">
                  Patient?identifier=123456<br />
                  Patient?identifier=ssn|123456<br />
                  Patient?birthDate=1970-01-01<br />
                </div>
                <div className="medplum-nav-search-hints-column">
                  Patient?identifier=123456<br />
                  Patient?identifier=ssn|123456<br />
                  Patient?birthDate=1970-01-01<br />
                </div>
              </div>
            </div>
          )}
        </div>
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