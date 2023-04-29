import { Button, createStyles, Navbar as MantineNavbar, Space, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { BookmarkDialog } from '../BookmarkDialog/BookmarkDialog';
import { CodeInput } from '../CodeInput/CodeInput';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useMedplumNavigate } from '../MedplumProvider/MedplumProvider';

const useStyles = createStyles((theme) => {
  return {
    menuTitle: {
      margin: '20px 0 4px 6px',
      fontSize: '9px',
      fontWeight: 'normal',
      textTransform: 'uppercase',
      letterSpacing: '2px',
    },

    link: {
      ...theme.fn.focusStyles(),
      display: 'flex',
      alignItems: 'center',
      textDecoration: 'none',
      fontSize: theme.fontSizes.sm,
      color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
      padding: `8px 12px`,
      borderRadius: theme.radius.sm,
      fontWeight: 500,

      '&:hover': {
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        textDecoration: 'none',

        [`& svg`]: {
          color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        },
      },

      '& svg': {
        color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
        marginRight: theme.spacing.sm,
        strokeWidth: 1.5,
        width: 18,
        height: 18,
      },
    },

    linkActive: {
      '&, &:hover': {
        backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        [`& svg`]: {
          color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        },
      },
    },
  };
});

export interface NavbarLink {
  icon?: JSX.Element;
  label?: string;
  href: string;
}

export interface NavbarMenu {
  title?: string;
  links?: NavbarLink[];
}

export interface NavbarProps {
  menus?: NavbarMenu[];
  closeNavbar: () => void;
  displayAddBookMark?: boolean;
}

interface NavBarState {
  bookmarkDialogVisible: boolean;
}

export function Navbar(props: NavbarProps): JSX.Element {
  const { classes } = useStyles();
  const navigate = useMedplumNavigate();
  const [state, setState] = useState<NavBarState>({
    bookmarkDialogVisible: false,
  });
  const stateRef = useRef<NavBarState>(state);
  stateRef.current = state;

  function onLinkClick(e: React.SyntheticEvent, to: string): void {
    e.stopPropagation();
    e.preventDefault();
    navigate(to);
    if (window.innerWidth < 768) {
      props.closeNavbar();
    }
  }

  function navigateResourceType(resourceType: string | undefined): void {
    if (resourceType) {
      navigate(`/${resourceType}`);
    }
  }

  return (
    <>
      <MantineNavbar width={{ sm: 250 }} p="xs">
        <MantineNavbar.Section mb="sm">
          <CodeInput
            key={window.location.pathname}
            name="resourceType"
            placeholder="Resource Type"
            property={{
              binding: {
                valueSet: 'http://hl7.org/fhir/ValueSet/resource-types',
              },
            }}
            onChange={(newValue) => navigateResourceType(newValue)}
            creatable={false}
            maxSelectedValues={0}
            clearSearchOnChange={true}
            clearable={false}
          />
        </MantineNavbar.Section>
        {props.displayAddBookMark && (
          <MantineNavbar.Section mb="sm">
            <Button
              leftIcon={<IconPlus />}
              variant="white"
              onClick={() => setState({ ...stateRef.current, bookmarkDialogVisible: true })}
            >
              Add Bookmark
            </Button>
          </MantineNavbar.Section>
        )}
        {props.menus && (
          <MantineNavbar.Section grow>
            {props.menus.map((menu) => (
              <React.Fragment key={`menu-${menu.title}`}>
                <Text className={classes.menuTitle}>{menu.title}</Text>
                {menu.links?.map((link) => (
                  <NavbarLink key={link.href} to={link.href} onClick={(e) => onLinkClick(e, link.href)}>
                    <NavLinkIcon to={link.href} icon={link.icon} />
                    <span>{link.label}</span>
                  </NavbarLink>
                ))}
              </React.Fragment>
            ))}
          </MantineNavbar.Section>
        )}
      </MantineNavbar>
      <BookmarkDialog
        visible={stateRef.current.bookmarkDialogVisible}
        onOk={() => {
          return setState({
            ...stateRef.current,
            bookmarkDialogVisible: false,
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            bookmarkDialogVisible: false,
          });
        }}
      />
    </>
  );
}
interface NavbarLinkProps {
  to: string;
  onClick: React.MouseEventHandler;
  children: React.ReactNode;
}

function NavbarLink(props: NavbarLinkProps): JSX.Element {
  const { classes, cx } = useStyles();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toUrl = new URL(props.to, window.location.protocol + '//' + window.location.host);
  const isActive = location.pathname === toUrl.pathname && matchesParams(searchParams, toUrl);

  return (
    <MedplumLink onClick={props.onClick} to={props.to} className={cx(classes.link, { [classes.linkActive]: isActive })}>
      {props.children}
    </MedplumLink>
  );
}

/**
 * Returns true if the search params match.
 * @param searchParams The current search params.
 * @param toUrl The destination URL of the link.
 * @returns True if the search params match.
 */
function matchesParams(searchParams: URLSearchParams, toUrl: URL): boolean {
  for (const [key, value] of toUrl.searchParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

interface NavLinkIconProps {
  to: string;
  icon?: JSX.Element;
}

function NavLinkIcon(props: NavLinkIconProps): JSX.Element {
  if (props.icon) {
    return props.icon;
  }
  return <Space w={30} />;
}
