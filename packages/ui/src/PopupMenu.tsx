import React from 'react';
import './PopupMenu.css';

interface PopupMenuProps {
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children?: React.ReactNode;
}

export function PopupMenu(props: PopupMenuProps) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const style: React.CSSProperties = {
    display: props.visible ? 'block' : 'none'
  };

  if (props.x > width - 250) {
    style.right = (width - props.x) + 'px';
  } else {
    style.left = props.x + 'px';
  }

  if (props.y > height - 300) {
    style.bottom = (height - props.y) + 'px';
  } else {
    style.top = props.y + 'px';
  }

  return (
    <div className="medplum-popup-menu" style={style}>
      {props.children}
    </div>
  );
}
