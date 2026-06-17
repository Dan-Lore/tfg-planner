import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { PackData, Recipe } from '@/data/types';
import { formatRecipeLabel } from '@/lib/recipe-label';

interface RecipePickerProps {
  pack: PackData;
  recipes: Recipe[];
  value: string;
  lang: 'ru' | 'en';
  dragging?: boolean;
  onChange: (recipeId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

function stopFlow(e: ReactMouseEvent | ReactWheelEvent) {
  e.stopPropagation();
}

export function RecipePicker({
  pack,
  recipes,
  value,
  lang,
  dragging,
  onChange,
  onOpenChange,
}: RecipePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = recipes.find((r) => r.id === value);
  const label = current ? formatRecipeLabel(pack, current, lang) : '';

  useEffect(() => {
    if (dragging) setOpen(false);
  }, [dragging]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target;
      if (
        rootRef.current &&
        target instanceof globalThis.Node &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`recipe-picker nodrag nowheel ${open ? 'recipe-picker--open' : ''}`}
      onMouseDown={stopFlow}
      onClick={stopFlow}
      onWheel={stopFlow}
    >
      <button
        type="button"
        className="recipe-picker__trigger"
        title={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="recipe-picker__label">{label}</span>
        <span className="recipe-picker__chevron" aria-hidden />
      </button>
      {open && (
        <ul className="recipe-picker__menu" role="listbox" onWheel={stopFlow}>
          {recipes.map((r) => {
            const optionLabel = formatRecipeLabel(pack, r, lang);
            const selected = r.id === value;
            return (
              <li key={r.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`recipe-picker__option ${selected ? 'recipe-picker__option--selected' : ''}`}
                  title={optionLabel}
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  {optionLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
