import { createStyles, getStylesRef, Title } from '@mantine/core';
import React from 'react';
import { NavLink } from 'react-router-dom';

export interface SubMenuProps {
  name: string;
  href: string;
}

export interface SideMenuProps {
  title: string;
  menu: { name: string; href: string; subMenu?: SubMenuProps[] }[];
}

const useStyles = createStyles((theme) => {
  const icon = getStylesRef('icon');
  return {
    container: {
      flex: 200,
      width: 200,
      paddingTop: 32,
    },

    title: {
      fontWeight: 500,
      marginBottom: 8,
    },

    link: {
      ...theme.fn.focusStyles(),
      display: 'flex',
      alignItems: 'center',
      textDecoration: 'none',
      fontSize: theme.fontSizes.sm,
      color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      borderRadius: theme.radius.sm,
      fontWeight: 500,

      '&:hover': {
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,

        [`& .${icon}`]: {
          color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        },
      },
    },

    linkIcon: {
      ref: icon,
      color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
      marginRight: theme.spacing.sm,
    },

    linkActive: {
      '&, &:hover': {
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[1],
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
      },
    },
  };
});

export function SideMenu(props: SideMenuProps): JSX.Element {
  const { classes, cx } = useStyles();
  return (
    <div className={classes.container}>
      <Title order={4} className={classes.title}>
        {props.title}
      </Title>
      {props.menu.map((item) => (
        <React.Fragment key={item.href}>
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
        </React.Fragment>
      ))}
    </div>
  );
}
