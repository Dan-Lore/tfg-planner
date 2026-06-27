import { useTranslation } from 'react-i18next';
import type { RecipePickerDetail } from '@/lib/recipe-picker-detail';

interface RecipeComboboxOptionProps {
  detail: RecipePickerDetail;
}

function FlowChips({
  chips,
  kind,
}: {
  chips: RecipePickerDetail['inputs'];
  kind: 'in' | 'out';
}) {
  if (chips.length === 0) {
    return <span className="recipe-flow-chip recipe-flow-chip--empty">—</span>;
  }
  return (
    <>
      {chips.map((chip, i) => (
        <span
          key={`${kind}-${i}`}
          className={[
            'recipe-flow-chip',
            `recipe-flow-chip--${kind}`,
            chip.chanced ? 'recipe-flow-chip--chanced' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {chip.text}
        </span>
      ))}
    </>
  );
}

export function RecipeComboboxOption({ detail }: RecipeComboboxOptionProps) {
  const { t } = useTranslation();

  return (
    <div className="recipe-combobox-option">
      <div className="recipe-combobox-option__header">
        <div className="recipe-combobox-option__meta">
          {detail.tierLabel && (
            <span className="recipe-combobox-option__tier">{detail.tierLabel}</span>
          )}
          {detail.circuitLabel && (
            <span className="recipe-combobox-option__circuit">
              {t('editor.circuitMeta', { value: detail.circuitLabel })}
            </span>
          )}
          <span className="recipe-combobox-option__duration">{detail.durationLabel}</span>
          {detail.energyLabel && (
            <span className="recipe-combobox-option__energy">{detail.energyLabel}</span>
          )}
        </div>
        <span className="recipe-combobox-option__id">{detail.idHint}</span>
      </div>
      <div className="recipe-combobox-option__row recipe-combobox-option__row--in">
        <span className="recipe-combobox-option__side-label">{t('editor.recipeIn')}</span>
        <div className="recipe-combobox-option__flows">
          <FlowChips chips={detail.inputs} kind="in" />
        </div>
      </div>
      <div className="recipe-combobox-option__row recipe-combobox-option__row--out">
        <span className="recipe-combobox-option__side-label">{t('editor.recipeOut')}</span>
        <div className="recipe-combobox-option__flows">
          <FlowChips chips={detail.outputs} kind="out" />
        </div>
      </div>
    </div>
  );
}
