import { useRef, useState, type InputHTMLAttributes, type WheelEvent } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

const inputValue = (value: NumberInputProps['value']) => value == null ? '' : String(value);

export function NumberInput({ onBlur, onChange, onFocus, onWheel, value, ...props }: NumberInputProps) {
  const focused = useRef(false);
  const controlled = value !== undefined;
  const externalValue = inputValue(value);
  const [draft, setDraft] = useState(externalValue);

  return (
    <input {...props} type="number" value={controlled ? (focused.current ? draft : externalValue) : undefined}
      onChange={(event) => {
        if (controlled) setDraft(event.currentTarget.value);
        onChange?.(event);
      }}
      onFocus={(event) => {
        focused.current = true;
        setDraft(event.currentTarget.value);
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        setDraft(externalValue);
        onBlur?.(event);
      }}
      onWheel={(event: WheelEvent<HTMLInputElement>) => {
        event.currentTarget.blur();
        event.preventDefault();
        onWheel?.(event);
      }}
    />
  );
}
