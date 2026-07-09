import type { TfgpEdgeConstraint } from '@/schema/tfgp';
import { getFlowStoreState } from '@/stores/flow-store';
import { patchSchemeFields } from './scheme-store-helpers';
import type { SchemeCacheSlice } from './scheme-store-helpers';

type ConstraintGet = () => SchemeCacheSlice;
type ConstraintSet = (
  partial:
    | Partial<SchemeCacheSlice>
    | ((s: SchemeCacheSlice) => Partial<SchemeCacheSlice>),
) => void;

export function createSchemeEdgeConstraintActions(
  _get: ConstraintGet,
  set: ConstraintSet,
  pushHistory: () => void,
) {
  return {
    setEdgeConstraint: (constraint: TfgpEdgeConstraint) => {
      pushHistory();
      set((s) => {
        const rest = (s.scheme.edgeConstraints ?? []).filter(
          (c) => c.edgeId !== constraint.edgeId,
        );
        return patchSchemeFields(s, {
          edgeConstraints: [...rest, constraint],
        });
      });
      getFlowStoreState().recalculateScheme();
    },

    clearEdgeConstraint: (edgeId: string) => {
      pushHistory();
      set((s) =>
        patchSchemeFields(s, {
          edgeConstraints: (s.scheme.edgeConstraints ?? []).filter(
            (c) => c.edgeId !== edgeId,
          ),
        }),
      );
      getFlowStoreState().recalculateScheme();
    },
  };
}
