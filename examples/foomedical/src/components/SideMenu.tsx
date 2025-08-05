// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import cx from 'clsx';
import { Fragment, JSX } from 'react';
import { NavLink } from 'react-router';
import classes from './SideMenu.module.css';

export interface SubMenuProps {
  readonly name: string;
  readonly href: string;
}

export interface SideMenuProps {
  readonly title: string;
  readonly menu: { name: string; href: string; subMenu?: SubMenuProps[] }[];
}

export function SideMenu(props: SideMenuProps): JSX.Element {
  return (
    <div className={classes.container}>
      <Title order={4} className={classes.title}>
        {props.title}
      </Title>
      {props.menu.map((item) => (
        <Fragment key={item.href}>
          <NavLink to={item.href} end className={({ isActive }) => cx(classes.link, isActive && classes.linkActive)}>
            <span>{item.name}</span>
          </NavLink>
          {item.subMenu?.map((subItem) => (
            <div key={subItem.href} style={{ paddingLeft: 20 }}>
              <NavLink to={subItem.href} className={classes.link}>
                <span>{subItem.name}</span>
              </NavLink>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
