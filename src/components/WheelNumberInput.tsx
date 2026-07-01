import { useCallback, useId } from 'react';
import { adjustByWheel } from '@/lib/wheel-adjust';
import { useNonPassiveWheel } from '@/hooks/use-non-passive-wheel';

interface WheelNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  step: number;
  className?: string;
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'onWheel' | 'ref'
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
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(adjustByWheel(value, e.deltaY, step, min));
    },
    [value, onChange, step, min],
  );
  const wheelRef = useNonPassiveWheel<HTMLInputElement>(handleWheel);

  return (
    <input
      ref={wheelRef}
      type="number"
      id={inputProps?.id ?? defaultInputId}
      name={inputProps?.name ?? defaultInputId}
      className={className}
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      {...inputProps}
    />
  );
}
