import { useEffect, useMemo, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackLike } from '@/data/pack-registry';
import type { Recipe } from '@/data/types';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { buildRecipeComboboxItems } from '@/lib/search-combobox';
import { SearchCombobox } from '@/components/SearchCombobox';

interface RecipePickerProps {
  pack: PackLike;
  recipes: Recipe[];
  machineId: string;
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
  machineId,
  value,
  lang,
  dragging,
  onChange,
  onOpenChange,
}: RecipePickerProps) {
  const { t } = useTranslation();
  const items = useMemo(
    () => buildRecipeComboboxItems(pack, recipes, lang, { machineId }),
    [pack, recipes, lang, machineId],
  );

  const displayValue = useMemo(() => {
    const recipe = recipes.find((r) => r.id === value);
    return recipe ? formatRecipeLabel(pack, recipe, lang) : '';
  }, [pack, recipes, value, lang]);

  useEffect(() => {
    if (dragging) onOpenChange?.(false);
  }, [dragging, onOpenChange]);

  return (
    <div
      className="recipe-picker nodrag nowheel"
      onMouseDown={stopFlow}
      onClick={stopFlow}
      onWheel={stopFlow}
    >
      <SearchCombobox
        mode="recipe"
        items={items}
        value={value}
        displayValue={displayValue}
        placeholder={t('editor.searchRecipe')}
        className="search-combobox--compact"
        onChange={onChange}
        onOpenChange={onOpenChange}
        stopPropagation
        closeOnDrag={!!dragging}
        resetKey={value}
      />
    </div>
  );
}
