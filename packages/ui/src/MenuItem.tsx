import React from 'react';
import './MenuItem.css';

interface MenuItemProps {
  onClick?: () => void;
  url?: string;
  children?: React.ReactNode;
}

export function MenuItem(props: MenuItemProps) {
  function handleClick() {
    if (props.onClick) {
      props.onClick();
    }
  }

  return (
    <div className="medplum-menu-item" onClick={_ => handleClick()}>
      {props.children}
    </div>
  );
}
