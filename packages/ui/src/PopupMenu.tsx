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
  // private readonly clickHandler: () => void;

  // constructor(props: PopupMenuProps) {
  //   super(props);
  //   clickHandler = handleClick.bind(this);
  // }

  function handleClick() {
    if (!props.visible) {
      return;
    }

    if (props.onClose) {
      props.onClose();
    }
  }

  // render() {
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

  // componentDidUpdate(prevProps: PopupMenuProps) {
  //   if (!prevProps.visible && props.visible) {
  //     document.removeEventListener('click', clickHandler as any);
  //     window.setTimeout(() => document.addEventListener('click', clickHandler as any), 10);
  //   } else if (prevProps.visible && !props.visible) {
  //     document.removeEventListener('click', clickHandler as any);
  //   }
  // }

