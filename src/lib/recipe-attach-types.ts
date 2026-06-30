import type { Recipe } from '@/data/types';

export interface AttachCandidate {
  machineId: string;
  recipeId: string;
  portId: string;
  recipe: Recipe;
  label: string;
}
