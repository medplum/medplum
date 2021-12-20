import React, { useEffect, useRef, useState } from 'react';
import { Popup } from './Popup';
import './SubMenu.css';

export interface SubMenuProps {
  title: string;
  children: React.ReactNode;
}

export function SubMenu(props: SubMenuProps): JSX.Element {
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<DOMRectReadOnly | undefined>(undefined);
  const menuItemRef = useRef<HTMLDivElement>(null);

  const hoverRef = useRef<boolean>(false);
  hoverRef.current = hover;

  const visibleRef = useRef<boolean>(false);
  visibleRef.current = visible;

  function show() {
    const el = menuItemRef.current;
    if (el) {
      setAnchor(el.getBoundingClientRect());
      setVisible(true);
    }
  }

  useEffect(() => {
    const timerId = window.setInterval(() => {
      if (!visibleRef.current && hoverRef.current) {
        show();
      } else if (visibleRef.current && !hoverRef.current) {
        setVisible(false);
      }
    }, 150);
    return () => window.clearInterval(timerId);
  }, []);

  return (
    <div
      ref={menuItemRef}
      className="medplum-menu-item medplum-submenu-item"
      onClick={() => show()}
      onMouseOver={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {props.title}
      <span className="medplum-submenu-arrow">{'\u25BA'}</span>
      <Popup visible={visible} anchor={anchor} autoClose={true} onClose={() => setVisible(false)}>
        {props.children}
      </Popup>
    </div>
  );
}
