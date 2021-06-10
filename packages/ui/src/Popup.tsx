import React, { useEffect, useRef } from 'react';
import { useMedplumRouter } from './MedplumProvider';
import './Popup.css';

interface PopupProps {
  visible: boolean;
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

  return (
    <>
      {props.modal && (
        <div
          className={props.visible ? 'medplum-backdrop active' : 'medplum-backdrop'}
          onClick={props.onClose}
        />
      )}
      <div ref={ref} className={props.visible ? props.activeClassName : props.inactiveClassName}>
        {props.children}
      </div>
    </>
  );
}
