import React, { useEffect, useRef } from 'react';
import { useMedplumRouter } from './MedplumProvider';
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
  const router = useMedplumRouter();
  const ref = useRef<HTMLDivElement>(null);

  const propsRef = useRef<PopupProps>();
  propsRef.current = props;

  useEffect(() => {
    function handleClick(e: Event) {
      if (propsRef.current?.visible &&
        propsRef.current?.autoClose &&
        ref?.current && !ref.current.contains(e.target as Node)) {
        props.onClose();
      }
    }

    document.addEventListener('click', handleClick, true);

    const unlisten = router.listen(() => props.onClose());

    return () => {
      document.removeEventListener('click', handleClick, true);
      unlisten();
    };

  }, []);

  const style: React.CSSProperties = {
    display: props.visible ? 'block' : 'none'
  };

  if (props.x !== undefined && props.y !== undefined) {
    const width = window.innerWidth;
    const height = window.innerHeight;

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
  }

  return (
    <>
      {props.modal && (
        <div
          className={props.visible ? 'medplum-backdrop active' : 'medplum-backdrop'}
          onClick={props.onClose}
        />
      )}
      <div
        ref={ref}
        className={'medplum-popup ' + (props.visible ? props.activeClassName : props.inactiveClassName)}
        style={style}>
        {props.children}
      </div>
    </>
  );
}
