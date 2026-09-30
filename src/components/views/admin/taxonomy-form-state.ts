/**
 * FR-06 dirty-state helpers for the category/tag admin forms.
 *
 * A form is "dirty" when ANY editable field differs from the baseline
 * captured when the form was loaded (edit) or reset (new). Canceling a
 * switch keeps the target id/version AND every input, so the baseline is
 * only ever replaced on: loading a target, an explicit reset/discard, or a
 * CONFIRMED save — never on a failed save (which must keep the inputs).
 */

export interface CategoryFormValues {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
}

export interface CategoryFormBaseline {
  /** null while creating a new category. */
  id: string | null;
  version: number | null;
  values: CategoryFormValues;
}

export interface TagFormBaseline {
  /** null while the "add tag" input is in create mode. */
  id: string | null;
  version: number | null;
  name: string;
}

export function categoryFormDirty(baseline: CategoryFormBaseline, values: CategoryFormValues): boolean {
  return (
    values.name !== baseline.values.name ||
    values.slug !== baseline.values.slug ||
    values.description !== baseline.values.description ||
    values.icon !== baseline.values.icon ||
    values.sortOrder !== baseline.values.sortOrder
  );
}

export function tagFormDirty(baseline: TagFormBaseline, name: string): boolean {
  if (baseline.id === null) return name.trim() !== "";
  return name !== baseline.name;
}

/**
 * Guard for switching the edit target (new→edit, A→B, or re-clicking the
 * SAME row): a dirty form must confirm first, and re-clicking the current
 * target never overwrites the user's inputs (FR-06.4).
 */
export function shouldConfirmTargetSwitch(
  dirty: boolean,
  currentTargetId: string | null,
  nextTargetId: string,
): boolean {
  if (currentTargetId === nextTargetId) return false;
  return dirty;
}
