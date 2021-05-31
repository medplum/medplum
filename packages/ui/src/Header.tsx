import React, { useState } from 'react';
import { useMedplumContext } from './MedplumProvider';
import './Header.css';
import { Avatar } from './Avatar';

export interface HeaderProps {
  onLogo?: () => void;
  onProfile?: () => void;
  onSignIn?: () => void;
  onRegister?: () => void;
}

export function Header(props: HeaderProps) {
  const auth = useMedplumContext();
  const [searchHintsVisible, setSearchHintsVisible] = useState(false);
  return (
    <header role="banner">
      <div>
        <a href="#" onClick={props.onLogo}>
          <svg xmlns="http://www.w3.org/2000/svg" style={{ width: 20, height: 20, verticalAlign: 'text-top' }} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Medplum
          </a>
        <div className="medplum-nav-search-container">
          <form role="search">
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
          </form>
        </div>
      </div>
      <div>
        {auth.user ? (
          <a href="#" onClick={props.onProfile}>
            <Avatar resource={auth.profile as any} />
          </a>
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