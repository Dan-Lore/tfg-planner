import type { RecipeOp } from '../types.js';

export class RecipeStore {
  private recipes = new Map<string, RecipeOp>();

  set(recipe: RecipeOp): void {
    this.recipes.set(recipe.id, recipe);
  }

  get(id: string): RecipeOp | undefined {
    return this.recipes.get(id);
  }

  has(id: string): boolean {
    return this.recipes.has(id);
  }

  delete(id: string): boolean {
    return this.recipes.delete(id);
  }

  values(): RecipeOp[] {
    return [...this.recipes.values()];
  }

  size(): number {
    return this.recipes.size;
  }

  ids(): string[] {
    return [...this.recipes.keys()];
  }
}
