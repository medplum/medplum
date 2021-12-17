import React, { useEffect, useRef } from 'react';
import { Location, useLocation } from 'react-router-dom';
import './Popup.css';

interface PopupProps {
  visible: boolean;
  x?: number;
  y?: number;
  modal?: boolean;
  autoClose?: boolean;
  onClose: () => void;
  activeClassName?: string;
  inactiveClassName?: string;
  children?: React.ReactNode;
}

export function Popup(props: PopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Track location, and the location when the popup becomes visible
  const location = useLocation();
  const locationRef = useRef<Location>();
  if (props.visible) {
    if (locationRef.current === undefined) {
      locationRef.current = location;
    }
  } else {
    locationRef.current = undefined;
  }

  const propsRef = useRef<PopupProps>();
  propsRef.current = props;

  // Listen for clicks outside of the popup
  // If the user clicks outside of the popup, close it
  useEffect(() => {
    function handleClick(e: Event) {
      if (
        propsRef.current?.visible &&
        propsRef.current?.autoClose &&
        ref?.current &&
        !ref.current.contains(e.target as Node)
      ) {
        props.onClose();
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // Listen for changes in the location
  // If the browser navigates to a new page, close the popup
  useEffect(() => {
    if (props.visible && location !== locationRef.current) {
      props.onClose();
    }
  }, [location]);

  const style: React.CSSProperties = {
    display: props.visible ? 'block' : 'none',
  };

  if (props.x !== undefined && props.y !== undefined) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (props.x > width - 250) {
      style.right = width - props.x + 'px';
    } else {
      style.left = props.x + 'px';
    }

    if (props.y > height - 300) {
      style.bottom = height - props.y + 'px';
    } else {
      style.top = props.y + 'px';
    }
  }

  return (
    <>
      {props.modal && (
        <div className={props.visible ? 'medplum-backdrop active' : 'medplum-backdrop'} onClick={props.onClose} />
      )}
      <div
        ref={ref}
        className={'medplum-popup ' + (props.visible ? props.activeClassName : props.inactiveClassName)}
        style={style}
        data-testid="popup"
      >
        {props.children}
      </div>
    </>
  );
}
