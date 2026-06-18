import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  filterItemsByQuery,
  findActiveItemIndex,
  resolveMachineDisplayLabel,
  splitMachineDisplay,
  type SearchComboboxItem,
} from '@/lib/search-combobox';

export interface SearchComboboxProps {
  items: SearchComboboxItem[];
  value: string;
  mode: 'machine' | 'recipe';
  displayValue?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  onExplicitPick?: (id: string) => void;
  explicitId?: string | null;
  onQueryChange?: (query: string) => void;
  resetKey?: string | number;
  onOpenChange?: (open: boolean) => void;
  stopPropagation?: boolean;
  closeOnDrag?: boolean;
}

function stopFlow(e: ReactMouseEvent | ReactWheelEvent) {
  e.stopPropagation();
}

export function SearchCombobox({
  items,
  value,
  mode,
  displayValue = '',
  placeholder,
  className = '',
  disabled = false,
  onChange,
  onExplicitPick,
  explicitId = null,
  onQueryChange,
  resetKey,
  onOpenChange,
  stopPropagation = false,
  closeOnDrag = false,
}: SearchComboboxProps) {
  const { t } = useTranslation();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const filtered = useMemo(
    () => filterItemsByQuery(items, query),
    [items, query],
  );

  const activeIndex = useMemo(
    () => findActiveItemIndex(filtered, explicitId, value),
    [filtered, explicitId, value],
  );

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, filtered.length]);

  const machineDisplayLabel = useMemo(() => {
    if (mode !== 'machine') return undefined;
    if (highlightIndex >= 0 && filtered[highlightIndex]) {
      return filtered[highlightIndex].label;
    }
    return resolveMachineDisplayLabel(items, filtered, query, explicitId);
  }, [mode, items, filtered, query, explicitId, highlightIndex]);

  const machineParts =
    mode === 'machine'
      ? splitMachineDisplay(query, machineDisplayLabel)
      : null;

  const showRecipeLabel =
    mode === 'recipe' && !focused && !isSearching && !query && !!displayValue;

  const inputValue = showRecipeLabel ? displayValue : query;

  const setOpenSafe = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    setQuery('');
    setIsSearching(false);
    setHighlightIndex(-1);
    setOpenSafe(false);
  }, [resetKey, setOpenSafe]);

  useEffect(() => {
    if (closeOnDrag) setOpenSafe(false);
  }, [closeOnDrag, setOpenSafe]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target;
      if (
        rootRef.current &&
        target instanceof globalThis.Node &&
        !rootRef.current.contains(target)
      ) {
        setOpenSafe(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, setOpenSafe]);

  useEffect(() => {
    if (highlightIndex < 0) return;
    const item = filtered[highlightIndex];
    if (!item) return;
    optionRefs.current.get(item.id)?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, filtered]);

  const resolvePickId = useCallback(() => {
    if (filtered.length === 0) return null;
    const anchor = activeIndex >= 0 ? activeIndex : 0;
    if (highlightIndex >= 0 && filtered[highlightIndex]) {
      return filtered[highlightIndex].id;
    }
    return filtered[anchor]!.id;
  }, [filtered, activeIndex, highlightIndex]);

  const updateQuery = (next: string) => {
    setQuery(next);
    setIsSearching(true);
    onQueryChange?.(next);
    setOpenSafe(true);
  };

  const handleFocus = () => {
    setFocused(true);
    if (mode === 'recipe' && !isSearching && !query && displayValue) {
      setQuery('');
      setIsSearching(true);
      onQueryChange?.('');
    }
    setOpenSafe(true);
  };

  const handleBlur = () => {
    setFocused(false);
    setHighlightIndex(-1);
    setOpenSafe(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (filtered.length === 0) return;
      e.preventDefault();
      setOpenSafe(true);
      setHighlightIndex((prev) => {
        const anchor = activeIndex >= 0 ? activeIndex : 0;
        if (e.key === 'ArrowDown') {
          if (prev < 0) return Math.min(anchor + 1, filtered.length - 1);
          return Math.min(prev + 1, filtered.length - 1);
        }
        if (prev < 0) return Math.max(anchor - 1, 0);
        return Math.max(prev - 1, 0);
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = resolvePickId();
      if (pick) {
        handleSelect(pick);
        return;
      }
      inputRef.current?.blur();
      setOpenSafe(false);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpenSafe(false);
      inputRef.current?.blur();
    }
  };

  const handleSelect = (id: string) => {
    if (mode === 'machine') {
      onExplicitPick?.(id);
      setQuery('');
      setIsSearching(false);
      onQueryChange?.('');
    } else {
      onChange(id);
      setQuery('');
      setIsSearching(false);
      onQueryChange?.('');
    }
    setHighlightIndex(-1);
    setOpenSafe(false);
    inputRef.current?.blur();
  };

  const rootHandlers = stopPropagation
    ? {
        onMouseDown: stopFlow,
        onClick: stopFlow,
        onWheel: stopFlow,
      }
    : {};

  const showMachineOverlay = mode === 'machine' && !!machineParts && !!machineDisplayLabel;

  return (
    <div
      ref={rootRef}
      className={[
        'search-combobox',
        `search-combobox--${mode}`,
        open ? 'search-combobox--open' : '',
        focused ? 'search-combobox--focused' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rootHandlers}
    >
      <div className="search-combobox__input-wrap">
        {showMachineOverlay && machineParts && (
          <div className="search-combobox__ghost" aria-hidden>
            {machineParts.typed && (
              <span className="search-combobox__ghost-typed">{machineParts.typed}</span>
            )}
            {machineParts.suffix && (
              <span className="search-combobox__ghost-suffix">{machineParts.suffix}</span>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          className="search-combobox__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            highlightIndex >= 0 && filtered[highlightIndex]
              ? `${listId}-${filtered[highlightIndex].id}`
              : undefined
          }
          aria-autocomplete={mode === 'machine' ? 'both' : 'list'}
          value={inputValue}
          placeholder={
            mode === 'machine' && showMachineOverlay
              ? undefined
              : showRecipeLabel
                ? undefined
                : placeholder
          }
          disabled={disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={(e) => updateQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && (
        <ul
          id={listId}
          className={`search-combobox__menu ${stopPropagation ? 'nowheel' : ''}`}
          role="listbox"
          onWheel={stopPropagation ? stopFlow : undefined}
        >
          {filtered.length === 0 ? (
            <li className="search-combobox__empty" role="presentation">
              {t('editor.noMatches')}
            </li>
          ) : (
            filtered.map((item, index) => {
              const selected =
                mode === 'machine'
                  ? item.id === explicitId
                  : item.id === value;
              const highlighted = index === highlightIndex;
              return (
                <li key={item.id} role="presentation">
                  <button
                    ref={(el) => {
                      if (el) optionRefs.current.set(item.id, el);
                      else optionRefs.current.delete(item.id);
                    }}
                    id={`${listId}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected || highlighted}
                    className={[
                      'search-combobox__option',
                      selected ? 'search-combobox__option--selected' : '',
                      highlighted ? 'search-combobox__option--highlighted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={item.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => handleSelect(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
