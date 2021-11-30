import { getReferenceString, HumanName, Patient, ProfileResource } from '@medplum/core';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { Button } from './Button';
import './Header.css';
import { HumanNameDisplay } from './HumanNameDisplay';
import { MedplumLink } from './MedplumLink';
import { useMedplumContext } from './MedplumProvider';
import { Popup } from './Popup';
import { ResourceInput } from './ResourceInput';

export interface HeaderProps {
  onLogo?: () => void;
  onProfile?: () => void;
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
  const navigate = useNavigate();
  const context = useMedplumContext();
  const medplum = context.medplum;
  const logins = medplum.getLogins();
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  return (
    <>
      <header role="banner" data-testid="header">
        <div>
          <MedplumLink testid="header-menu-button" onClick={() => setSidebarVisible(!sidebarVisible)}>
            <svg xmlns="http://www.w3.org/2000/svg" style={{ width: 20, height: 20, verticalAlign: 'text-top' }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </MedplumLink>
          <MedplumLink testid="header-logo" onClick={props.onLogo}>
            Medplum
          </MedplumLink>
          {context.profile && (
            <ResourceInput
              resourceType="Patient"
              name="search"
              className="medplum-nav-search-container"
              placeholder="Search"
              onChange={(patient: Patient) => {
                navigate(`/${patient.resourceType}/${patient.id}`);
              }}
            />
          )}
        </div>
        {context.profile && (
          <div className="medplum-nav-menu-container">
            <MedplumLink testid="header-profile-menu-button" onClick={() => setUserMenuVisible(true)}>
              <Avatar size="small" color="#f68d42" value={context.profile} />
            </MedplumLink>
            <Popup
              visible={userMenuVisible}
              autoClose={true}
              activeClassName="medplum-nav-menu-popover"
              onClose={() => setUserMenuVisible(false)}>
              <div className="medplum-nav-menu">
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Avatar size="large" value={context.profile} />
                </div>
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <div style={{ margin: '4px auto 4px auto', fontWeight: 'bold' }}><HumanNameDisplay value={context.profile?.name?.[0] as HumanName} /></div>
                  <Button testid="header-profile-link" onClick={() => {
                    setUserMenuVisible(false);
                    if (props.onProfile) {
                      props.onProfile();
                    }
                  }}>Manage your account</Button>
                </div>
                {logins.length > 1 && (
                  <div>
                    <hr />
                    {logins.map(login => login.profile?.reference !== getReferenceString(context.profile as ProfileResource) && (
                      <div className="medplum-nav-menu-profile" key={login.profile?.reference} onClick={() => {
                        medplum.setActiveLogin(login);
                        setUserMenuVisible(false);
                        window.location.reload();
                      }}>
                        <div className="medplum-nav-menu-profile-icon">
                          <Avatar />
                        </div>
                        <div className="medplum-nav-menu-profile-label">
                          {login.profile?.display}
                          <div className="medplum-nav-menu-profile-help-text">
                            {login.project?.display}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Button testid="header-add-account-button" onClick={() => {
                    navigate('/signin');
                  }}>Add another account</Button>
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Button testid="header-signout-button" onClick={() => {
                    setUserMenuVisible(false);
                    if (props.onSignOut) {
                      props.onSignOut();
                    }
                  }}>Sign out of all accounts</Button>
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px', fontSize: '12px' }}>
                  <a href="https://www.medplum.com/terms">Terms</a>
                  <a href="https://www.medplum.com/privacy">Privacy</a>
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
