import { getReferenceString, ProfileResource } from '@medplum/core';
import { HumanName, UserConfiguration } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { HeaderSearchInput, HeaderSearchTypes } from './HeaderSearchInput';
import { HumanNameDisplay } from './HumanNameDisplay';
import { MedplumLink } from './MedplumLink';
import { useMedplumContext } from './MedplumProvider';
import { Popup } from './Popup';
import './Header.css';

export interface HeaderProps {
  onLogo?: () => void;
  onProfile?: () => void;
  onSignOut?: () => void;
  config?: UserConfiguration;
}

export function Header(props: HeaderProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useMedplumContext();
  const medplum = context.medplum;
  const logins = medplum.getLogins();
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  return (
    <>
      <header role="banner" data-testid="header">
        <div>
          <MedplumLink
            label="Toggle sidebar"
            testid="header-menu-button"
            onClick={() => setSidebarVisible(!sidebarVisible)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: 20, height: 20, verticalAlign: 'text-top' }}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </MedplumLink>
          <MedplumLink testid="header-logo" onClick={props.onLogo}>
            Medplum
          </MedplumLink>
          {context.profile && (
            <HeaderSearchInput
              key={`header-input-${location.pathname}`}
              name="search"
              className="medplum-nav-search-container"
              placeholder="Search"
              onChange={(resource: HeaderSearchTypes) => navigate(`/${resource.resourceType}/${resource.id}`)}
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
              onClose={() => setUserMenuVisible(false)}
            >
              <div className="medplum-nav-menu">
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Avatar size="large" value={context.profile} />
                </div>
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <div style={{ margin: '4px auto 4px auto', fontWeight: 'bold' }}>
                    <HumanNameDisplay value={context.profile?.name?.[0] as HumanName} />
                  </div>
                  <div style={{ margin: '4px auto 4px auto' }}>{medplum.getActiveLogin()?.project?.display}</div>
                  <Button
                    testid="header-profile-link"
                    onClick={() => {
                      setUserMenuVisible(false);
                      if (props.onProfile) {
                        props.onProfile();
                      }
                    }}
                  >
                    Manage your account
                  </Button>
                </div>
                {logins.length > 1 && (
                  <div>
                    <hr />
                    {logins.map(
                      (login) =>
                        login.profile?.reference !== getReferenceString(context.profile as ProfileResource) && (
                          <div
                            className="medplum-nav-menu-profile"
                            key={login.profile?.reference}
                            onClick={() => {
                              medplum.setActiveLogin(login);
                              setUserMenuVisible(false);
                              window.location.reload();
                            }}
                          >
                            <div className="medplum-nav-menu-profile-icon">
                              <Avatar />
                            </div>
                            <div className="medplum-nav-menu-profile-label">
                              {login.profile?.display}
                              <div className="medplum-nav-menu-profile-help-text">{login.project?.display}</div>
                            </div>
                          </div>
                        )
                    )}
                  </div>
                )}
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Button
                    testid="header-add-account-button"
                    onClick={() => {
                      navigate('/signin');
                    }}
                  >
                    Add another account
                  </Button>
                </div>
                <hr />
                <div style={{ margin: 'auto', padding: '8px' }}>
                  <Button
                    testid="header-signout-button"
                    onClick={() => {
                      setUserMenuVisible(false);
                      if (props.onSignOut) {
                        props.onSignOut();
                      }
                    }}
                  >
                    Sign out of all accounts
                  </Button>
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
        onClose={() => setSidebarVisible(false)}
      >
        {props.config?.menu?.map((menu, index) => (
          <React.Fragment key={`menu-${index}-${props.config?.menu?.length}`}>
            <h5>{menu.title}</h5>
            <ul>
              {menu.link?.map((link) => (
                <li key={link.target}>
                  <MedplumLink to={link.target}>{link.name}</MedplumLink>
                </li>
              ))}
            </ul>
          </React.Fragment>
        ))}
        <h5>Settings</h5>
        <ul>
          <li>
            <MedplumLink to={context.profile}>Profile</MedplumLink>
          </li>
          <li>
            <MedplumLink to="/changepassword">Change password</MedplumLink>
          </li>
        </ul>
      </Popup>
    </>
  );
}
