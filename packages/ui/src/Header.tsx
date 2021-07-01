import { HumanName } from '@medplum/core';
import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { HumanNameDisplay } from './HumanNameDisplay';
import { MedplumLink } from './MedplumLink';
import { useMedplumContext } from './MedplumProvider';
import { Popup } from './Popup';
import './Header.css';

export interface HeaderProps {
  onLogo?: () => void;
  onProfile?: () => void;
  onSignIn?: () => void;
  onRegister?: () => void;
  onSignOut?: () => void;
  sidebarLinks?: SidebarLinkGroup[];
}

export interface SidebarLinkGroup {
  title: string;
  links: SidebarLink[];
}

export interface SidebarLink {
  label: string;
  href: string;
}

export function Header(props: HeaderProps) {
  const auth = useMedplumContext();
  const [searchHintsVisible, setSearchHintsVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  return (
    <>
      <header role="banner">
        <div>
          <MedplumLink onClick={() => setSidebarVisible(!sidebarVisible)}>
            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: 20, height: 20, verticalAlign: 'text-top' }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </MedplumLink>
          <MedplumLink onClick={props.onLogo}>
            Medplum
          </MedplumLink>
          {auth.user && (
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
                <Popup
                  visible={searchHintsVisible}
                  activeClassName="medplum-popup medplum-nav-search-popover"
                  inactiveClassName="medplum-popup-hidden"
                  onClose={() => setSearchHintsVisible(false)}>
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
                </Popup>
              </form>
            </div>
          )}
        </div>
        {auth.user && (
          <div className="medplum-nav-menu-container">
            <MedplumLink onClick={() => setUserMenuVisible(true)}>
              <Avatar size="small" resource={auth.profile as any} />
            </MedplumLink>
            <Popup
              visible={userMenuVisible}
              autoClose={true}
              activeClassName="medplum-popup medplum-nav-menu-popover"
              inactiveClassName="medplum-popup-hidden"
              onClose={() => setUserMenuVisible(false)}>
              <div className="medplum-nav-menu">
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Avatar size="large" resource={auth.profile as any} />
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <div style={{ margin: '4px auto 4px auto', fontWeight: 'bold' }}><HumanNameDisplay value={auth.profile?.name?.[0] as HumanName} /></div>
                  <div style={{ margin: '4px auto 8px auto' }}>{auth.user?.email}</div>
                  <Button onClick={() => {
                    setUserMenuVisible(false);
                    if (props.onProfile) {
                      props.onProfile();
                    }
                  }}>Manage your account</Button>
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Button onClick={() => {
                    setUserMenuVisible(false);
                    if (props.onSignOut) {
                      props.onSignOut();
                    }
                  }}>Sign out</Button>
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px', fontSize: '12px' }}>
                  <MedplumLink to="/privacy">Privacy Policy</MedplumLink>
                  <MedplumLink to="/terms">Terms of Service</MedplumLink>
                </div>
              </div>
            </Popup>
          </div>
        )}
      </header>
      <Popup
        modal={true}
        autoClose={true}
        visible={sidebarVisible}
        activeClassName="medplum-sidebar active"
        inactiveClassName="medplum-sidebar"
        onClose={() => setSidebarVisible(false)}>
        {props.sidebarLinks?.map(group => (
          <React.Fragment key={group.title}>
            <h5>{group.title}</h5>
            <ul>
              {group.links.map(link => (
                <li key={link.href}><MedplumLink to={link.href}>{link.label}</MedplumLink></li>
              ))}
            </ul>
          </React.Fragment>
        ))}
      </Popup>
    </>
  );
}
