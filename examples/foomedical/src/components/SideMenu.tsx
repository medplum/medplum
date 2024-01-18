import { Title } from '@mantine/core';
import cx from 'clsx';
import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import classes from './SideMenu.module.css';

export interface SubMenuProps {
  name: string;
  href: string;
}

export interface SideMenuProps {
  title: string;
  menu: { name: string; href: string; subMenu?: SubMenuProps[] }[];
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
