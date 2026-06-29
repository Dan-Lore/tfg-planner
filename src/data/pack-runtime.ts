import type {
  ItemDef,
  Machine,
  PackData,
  PackMeta,
  PackSlice,
  Recipe,
  RecipeFlowAttachIndex,
  RecipeShardIndex,
} from './types';
import {
  machineIdsForRecipeIds,
  mergeRecipeLists,
  recipeIdsFromSchemeNodes,
  sliceAsPackData,
} from './pack-slice';
import { publicPath } from '@/lib/public-path';
import { buildRecipeFlowAttachIndex } from '@/lib/recipe-flow-attach-index';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/lib/tag-index';
import type { Flow } from './types';
import type { TagIndex } from '@/lib/tag-index';
import { machineIdsForFlowAttach } from '@/lib/recipe-flow-attach-index';
import type { TfgpFile } from '@/schema/tfgp';

export type JsonLoader = (url: string) => Promise<unknown>;

const defaultLoader: JsonLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
};

function indexUrl(recipesRoot: string): string {
  const root = recipesRoot.endsWith('/') ? recipesRoot : `${recipesRoot}/`;
  return `${root}index.json`;
}

function shardUrl(recipesRoot: string, file: string): string {
  const root = recipesRoot.endsWith('/') ? recipesRoot : `${recipesRoot}/`;
  return `${root}${file}`;
}

export type PackLoadStage = 'meta' | 'ready';

export class PackRuntime {
  readonly meta: PackMeta;
  private readonly recipesRoot: string;
  private readonly shardIndex: RecipeShardIndex;
  private readonly loadJson: JsonLoader;

  private recipeById = new Map<string, Recipe>();
  private machineShardCache = new Map<string, Recipe[]>();
  private loadingShards = new Map<string, Promise<Recipe[]>>();
  private flowAttachIndex: RecipeFlowAttachIndex | null = null;
  private flowAttachIndexPromise: Promise<RecipeFlowAttachIndex> | null = null;

  private itemById: Map<string, ItemDef>;
  private fluidById: Map<string, ItemDef>;
  private recipeIdToMachineId = new Map<string, string>();

  constructor(
    meta: PackMeta,
    recipesRoot: string,
    shardIndex: RecipeShardIndex,
    loadJson: JsonLoader = defaultLoader,
  ) {
    this.meta = meta;
    this.recipesRoot = recipesRoot;
    this.shardIndex = shardIndex;
    this.loadJson = loadJson;

    this.itemById = new Map(meta.items.map((i) => [i.id, i]));
    this.fluidById = new Map(meta.fluids.map((f) => [f.id, f]));
    for (const machine of meta.machines) {
      for (const recipeId of machine.recipeIds) {
        this.recipeIdToMachineId.set(recipeId, machine.id);
      }
    }
  }

  get modpackVersion(): string {
    return this.meta.modpackVersion;
  }

  get dataVersion(): number {
    return this.meta.dataVersion;
  }

  get machines(): Machine[] {
    return this.meta.machines;
  }

  get items(): ItemDef[] {
    return this.meta.items;
  }

  get fluids(): ItemDef[] {
    return this.meta.fluids;
  }

  get generatedAt(): string {
    return this.meta.generatedAt;
  }

  recipeCount(): number {
    return this.meta.machines.reduce((n, m) => n + m.recipeIds.length, 0);
  }

  getRecipe(id: string): Recipe | undefined {
    return this.recipeById.get(id);
  }

  getItemName(itemId: string, lang: 'ru' | 'en'): string {
    const item = this.itemById.get(itemId);
    if (item) return item.names[lang] ?? item.names.en;
    const fluid = this.fluidById.get(itemId);
    if (fluid) return fluid.names[lang] ?? fluid.names.en;
    return itemId;
  }

  getMachineName(machineId: string, lang: 'ru' | 'en'): string {
    const m = this.meta.machines.find((x) => x.id === machineId);
    return m ? (m.names[lang] ?? m.names.en) : machineId;
  }

  getMachineRecipeCount(machineId: string): number {
    return this.shardIndex.shards[machineId]?.count ?? 0;
  }

  getCachedRecipesForMachine(machineId: string): Recipe[] {
    return this.machineShardCache.get(machineId) ?? [];
  }

  async loadMachineRecipes(machineId: string): Promise<Recipe[]> {
    const cached = this.machineShardCache.get(machineId);
    if (cached) return cached;

    const pending = this.loadingShards.get(machineId);
    if (pending) return pending;

    const entry = this.shardIndex.shards[machineId];
    if (!entry) {
      const empty: Recipe[] = [];
      this.machineShardCache.set(machineId, empty);
      return empty;
    }

    const promise = this.loadJson(shardUrl(this.recipesRoot, entry.file)).then(
      (data) => {
        const recipes = data as Recipe[];
        this.machineShardCache.set(machineId, recipes);
        for (const recipe of recipes) {
          this.recipeById.set(recipe.id, recipe);
        }
        this.loadingShards.delete(machineId);
        return recipes;
      },
      (err) => {
        this.loadingShards.delete(machineId);
        throw err;
      },
    );
    this.loadingShards.set(machineId, promise);
    return promise;
  }

  async ensureRecipeIds(recipeIds: Iterable<string>): Promise<void> {
    const machineIds = machineIdsForRecipeIds(this.meta, recipeIds);
    await Promise.all([...machineIds].map((id) => this.loadMachineRecipes(id)));
  }

  async getSchemeSlice(scheme: TfgpFile): Promise<PackSlice> {
    const ids = recipeIdsFromSchemeNodes(scheme.nodes);
    await this.ensureRecipeIds(ids);
    const recipes: Recipe[] = [];
    for (const id of ids) {
      const recipe = this.recipeById.get(id);
      if (recipe) recipes.push(recipe);
    }
    return { meta: this.meta, recipes };
  }

  async getAllLoadedRecipes(): Promise<Recipe[]> {
    return mergeRecipeLists([...this.machineShardCache.values()]);
  }

  async getFlowAttachIndex(): Promise<RecipeFlowAttachIndex> {
    if (this.flowAttachIndex) return this.flowAttachIndex;
    if (!this.flowAttachIndexPromise) {
      this.flowAttachIndexPromise = this.loadFlowAttachIndex();
    }
    return this.flowAttachIndexPromise;
  }

  private async loadFlowAttachIndex(): Promise<RecipeFlowAttachIndex> {
    try {
      const data = (await this.loadJson(
        shardUrl(this.recipesRoot, 'flow-index.json'),
      )) as RecipeFlowAttachIndex;
      if (data.format !== 'tfg-pack-flow-index' || data.formatVersion !== 1) {
        throw new Error('Invalid flow-index format');
      }
      this.flowAttachIndex = data;
      return data;
    } catch (err) {
      if (!import.meta.env.DEV) {
        throw new Error(
          `Missing or invalid flow-index.json under ${this.recipesRoot}`,
          { cause: err },
        );
      }
      console.warn(
        '[PackRuntime] flow-index.json missing; building from all shards (dev fallback)',
      );
      const machineIds = Object.keys(this.shardIndex.shards);
      await Promise.all(machineIds.map((id) => this.loadMachineRecipes(id)));
      const recipes = await this.getAllLoadedRecipes();
      const tags = buildTagIndexForRecipes(
        this.meta,
        recipes,
        buildTagIndexFromMeta(this.meta),
      );
      this.flowAttachIndex = buildRecipeFlowAttachIndex(recipes, tags);
      return this.flowAttachIndex;
    }
  }

  /** Load recipe shards needed for port attach (downstream/upstream) for a product flow. */
  async ensureRecipesForPortAttach(
    flow: Flow,
    direction: 'upstream' | 'downstream',
    tags: TagIndex,
  ): Promise<void> {
    const attachIndex = await this.getFlowAttachIndex();
    const machineIds = machineIdsForFlowAttach(attachIndex, flow, direction, tags);
    await Promise.all([...machineIds].map((id) => this.loadMachineRecipes(id)));
  }

  recipesByIdMap(): Map<string, Recipe> {
    return new Map(this.recipeById);
  }

  toPackData(recipes: Recipe[]): PackData {
    return sliceAsPackData({ meta: this.meta, recipes });
  }

  static async fromManifestEntry(
    metaPath: string,
    recipesRoot: string,
    loadJson: JsonLoader = defaultLoader,
  ): Promise<PackRuntime> {
    const meta = (await loadJson(publicPath(metaPath))) as PackMeta;
    if (meta.formatVersion !== 2) {
      throw new Error(`Expected pack format v2 at ${metaPath}`);
    }
    const index = (await loadJson(publicPath(indexUrl(recipesRoot)))) as RecipeShardIndex;
    return new PackRuntime(meta, publicPath(recipesRoot), index, loadJson);
  }
}

/** v1 monolithic pack wrapped for unified API in tests. */
export class PackDataRuntime {
  readonly meta: PackData;
  private recipeById: Map<string, Recipe>;
  private byMachine: Map<string, Recipe[]>;

  constructor(readonly pack: PackData) {
    this.meta = pack;
    this.recipeById = new Map(pack.recipes.map((r) => [r.id, r]));
    this.byMachine = new Map();
    for (const recipe of pack.recipes) {
      const list = this.byMachine.get(recipe.machineId);
      if (list) list.push(recipe);
      else this.byMachine.set(recipe.machineId, [recipe]);
    }
  }

  get modpackVersion(): string {
    return this.pack.modpackVersion;
  }

  get dataVersion(): number {
    return this.pack.dataVersion;
  }

  get machines(): Machine[] {
    return this.pack.machines;
  }

  get items(): ItemDef[] {
    return this.pack.items;
  }

  get fluids(): ItemDef[] {
    return this.pack.fluids;
  }

  get generatedAt(): string {
    return this.pack.generatedAt;
  }

  recipeCount(): number {
    return this.pack.recipes.length;
  }

  getRecipe(id: string): Recipe | undefined {
    return this.recipeById.get(id);
  }

  getItemName(itemId: string, lang: 'ru' | 'en'): string {
    const item = this.pack.items.find((i) => i.id === itemId);
    if (item) return item.names[lang] ?? item.names.en;
    const fluid = this.pack.fluids.find((f) => f.id === itemId);
    if (fluid) return fluid.names[lang] ?? fluid.names.en;
    return itemId;
  }

  getMachineName(machineId: string, lang: 'ru' | 'en'): string {
    const m = this.pack.machines.find((x) => x.id === machineId);
    return m ? (m.names[lang] ?? m.names.en) : machineId;
  }

  getMachineRecipeCount(machineId: string): number {
    return this.byMachine.get(machineId)?.length ?? 0;
  }

  getCachedRecipesForMachine(machineId: string): Recipe[] {
    return this.byMachine.get(machineId) ?? [];
  }

  async loadMachineRecipes(machineId: string): Promise<Recipe[]> {
    return this.getCachedRecipesForMachine(machineId);
  }

  async ensureRecipeIds(_recipeIds: Iterable<string>): Promise<void> {}

  async getSchemeSlice(scheme: TfgpFile): Promise<PackSlice> {
    const ids = recipeIdsFromSchemeNodes(scheme.nodes);
    const recipes: Recipe[] = [];
    for (const id of ids) {
      const recipe = this.recipeById.get(id);
      if (recipe) recipes.push(recipe);
    }
    return { meta: this.pack, recipes };
  }

  async getAllLoadedRecipes(): Promise<Recipe[]> {
    return this.pack.recipes;
  }

  async getFlowAttachIndex(): Promise<RecipeFlowAttachIndex> {
    const tags = buildTagIndexForRecipes(
      this.pack,
      this.pack.recipes,
      buildTagIndexFromMeta(this.pack),
    );
    return buildRecipeFlowAttachIndex(this.pack.recipes, tags);
  }

  async ensureRecipesForPortAttach(
    _flow: Flow,
    _direction: 'upstream' | 'downstream',
    _tags: TagIndex,
  ): Promise<void> {}

  recipesByIdMap(): Map<string, Recipe> {
    return new Map(this.recipeById);
  }

  toPackData(recipes: Recipe[]): PackData {
    return { ...this.pack, recipes };
  }
}

export type ActivePack = PackRuntime | PackDataRuntime;

export function wrapPackData(pack: PackData): PackDataRuntime {
  return new PackDataRuntime(pack);
}

export function isPackRuntime(pack: ActivePack): pack is PackRuntime {
  return pack instanceof PackRuntime;
}
