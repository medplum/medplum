import React, { createContext, ReactNode, useContext, useState } from 'react';

type FieldProps = {
  name?: string;
  value: any;
  editable: boolean;
  isEditing: boolean;
  children?: React.ReactNode;
};

type FieldState = Omit<FieldProps, 'children'> & {
  setEditing?: (isEditing: boolean) => void;
};

const defaultState: FieldState = {
  name: '',
  value: '',
  editable: false,
  isEditing: false,
};

const FieldStateContext = createContext<FieldState>(defaultState);

// eslint-disable-next-line
function isFunction(value: any): value is Function {
  return !!(value && {}.toString.call(value) == '[object Function]');
}
function Field(props: FieldProps): JSX.Element {
  const [isEditing, setEditing] = useState(props.isEditing);
  const { children, ...rest } = props;
  return (
    <FieldStateContext.Provider value={{ ...rest, isEditing, setEditing }}>
      {children || (
        <>
          <FieldName />
          <FieldValue />
          <FieldEditToggle />
        </>
      )}
    </FieldStateContext.Provider>
  );
}

type RenderChildren<T> = { children?: ReactNode | ((arg: T) => JSX.Element) };

function userRenderFunction<T, Q extends RenderChildren<T>>(data: T, props: Q, defaultValue: ReactNode): ReactNode {
  if (isFunction(props.children)) {
    return props.children(data);
  }
  if (props.children) {
    return props.children;
  }
  return defaultValue;
}

function FieldName(props: RenderChildren<Pick<FieldState, 'name'>>): JSX.Element {
  const { name } = useContext(FieldStateContext);
  return <>{userRenderFunction({ name }, props, <span>{name}</span>)}</>;
}

function FieldValue(props: RenderChildren<Pick<FieldState, 'isEditing' | 'value'>>): JSX.Element {
  const { isEditing, value } = useContext(FieldStateContext);
  return (
    <>
      {userRenderFunction(
        { isEditing, value },
        props,
        isEditing ? <input defaultValue={value} /> : <span>{value}</span>
      )}
    </>
  );
}

function FieldEditToggle(
  props: RenderChildren<Pick<FieldState, 'isEditing' | 'setEditing'>> & React.HTMLAttributes<HTMLButtonElement>
): JSX.Element {
  const { isEditing, setEditing, editable } = useContext(FieldStateContext);
  if (!editable) {
    return <></>;
  }
  const defaultStyle = {
    style: {
      width: 'clamp(16px, 16px, 32px)',
      height: 'clamp(16px, 16px, 32px)',
      margin: '6px',
    },
  };

  return (
    <>
      {userRenderFunction(
        { isEditing, setEditing },
        props,
        <button
          {...{ ...defaultStyle, ...props }}
          onClick={() => {
            setEditing && setEditing(!isEditing);
          }}
        />
      )}
    </>
  );
}

const Root = Field;
const Name = FieldName;
const Value = FieldValue;
const EditToggle = FieldEditToggle;
export { Root, Name, Value, EditToggle };
export type { FieldState };
