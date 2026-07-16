import type { InputHTMLAttributes, WheelEvent } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function NumberInput({ onFocus, onWheel, ...props }: NumberInputProps) {
  return (
    <input {...props} type='number'
      onFocus={(event) => {
        if (/^-?0(?:\.0*)?$/.test(event.currentTarget.value)) event.currentTarget.select();
        onFocus?.(event);
      }}
      onWheel={(event: WheelEvent<HTMLInputElement>) => {
        event.currentTarget.blur();
        event.preventDefault();
        onWheel?.(event);
      }}
    />
  );
}
