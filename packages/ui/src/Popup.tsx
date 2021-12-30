import React, { useEffect, useRef } from 'react';
import { Location, useLocation } from 'react-router-dom';
import './Popup.css';

interface PopupProps {
  visible: boolean;
  anchor?: DOMRectReadOnly;
  modal?: boolean;
  autoClose?: boolean;
  onClose: () => void;
  activeClassName?: string;
  inactiveClassName?: string;
  children?: React.ReactNode;
}

export function Popup(props: PopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Track browser URL location, and the location when the popup becomes visible
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

  if (props.anchor) {
    if (props.anchor.right + 250 < document.body.clientWidth) {
      style.left = props.anchor.right + 'px';
    } else {
      style.right = document.body.clientWidth - props.anchor.left + 'px';
    }

    if (props.anchor.top + 300 < document.body.clientHeight) {
      style.top = props.anchor.top + 'px';
    } else {
      style.bottom = document.body.clientHeight - props.anchor.top + 'px';
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
