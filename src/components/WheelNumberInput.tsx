import { useId, type WheelEvent } from 'react';
import { adjustByWheel } from '@/lib/wheel-adjust';

interface WheelNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  step: number;
  className?: string;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'onWheel'
  >;
}

export function WheelNumberInput({
  value,
  onChange,
  min,
  step,
  className = '',
  inputProps,
}: WheelNumberInputProps) {
  const defaultInputId = useId();
  const handleWheel = (e: WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(adjustByWheel(value, e.deltaY, step, min));
  };

  return (
    <input
      type="number"
      id={inputProps?.id ?? defaultInputId}
      name={inputProps?.name ?? defaultInputId}
      className={className}
      value={value}
      min={min}
      step={step}
      onWheel={handleWheel}
      onChange={(e) => onChange(Number(e.target.value))}
      {...inputProps}
    />
  );
}
