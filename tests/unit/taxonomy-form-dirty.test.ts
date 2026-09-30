import { describe, expect, it } from "vitest";
import {
  categoryFormDirty,
  shouldConfirmTargetSwitch,
  tagFormDirty,
  type CategoryFormBaseline,
  type CategoryFormValues,
} from "@/components/views/admin/taxonomy-form-state";

const categoryValues = (overrides: Partial<CategoryFormValues> = {}): CategoryFormValues => ({
  name: "开发笔记", slug: "dev-notes", description: "描述", icon: "dev", sortOrder: 3, ...overrides,
});

describe("categoryFormDirty (FR-06.1/2: every editable field in the baseline)", () => {
  const baseline: CategoryFormBaseline = { id: "cat-1", version: 7, values: categoryValues() };

  it("is clean right after loading and after restoring the original values", () => {
    expect(categoryFormDirty(baseline, categoryValues())).toBe(false);
    const edited = categoryValues({ name: "改名", description: "新描述", sortOrder: 9 });
    expect(categoryFormDirty(baseline, edited)).toBe(true);
    expect(categoryFormDirty(baseline, categoryValues())).toBe(false);
  });

  it("name, slug, description, icon, and sortOrder each independently mark the form dirty (AC-06-02)", () => {
    expect(categoryFormDirty(baseline, categoryValues({ name: "别的" }))).toBe(true);
    expect(categoryFormDirty(baseline, categoryValues({ slug: "other" }))).toBe(true);
    expect(categoryFormDirty(baseline, categoryValues({ description: "" }))).toBe(true);
    expect(categoryFormDirty(baseline, categoryValues({ icon: "bulb" }))).toBe(true);
    expect(categoryFormDirty(baseline, categoryValues({ sortOrder: 4 }))).toBe(true);
  });

  it("new-form baseline: untouched defaults are clean, typed text is dirty", () => {
    const fresh: CategoryFormBaseline = { id: null, version: null, values: { name: "", slug: "", description: "", icon: "dev", sortOrder: 5 } };
    expect(categoryFormDirty(fresh, { name: "", slug: "", description: "", icon: "dev", sortOrder: 5 })).toBe(false);
    expect(categoryFormDirty(fresh, { name: "", slug: "", description: "", icon: "bulb", sortOrder: 5 })).toBe(true);
    expect(categoryFormDirty(fresh, { name: "新分类", slug: "", description: "", icon: "dev", sortOrder: 5 })).toBe(true);
  });
});

describe("tagFormDirty (AC-06-03: unsubmitted new-tag text counts)", () => {
  it("create mode: blank is clean; any non-blank text is dirty", () => {
    const fresh = { id: null, version: null, name: "" };
    expect(tagFormDirty(fresh, "")).toBe(false);
    expect(tagFormDirty(fresh, "  ")).toBe(false);
    expect(tagFormDirty(fresh, "前端")).toBe(true);
  });

  it("edit mode: differs from the loaded name", () => {
    const editing = { id: "tag-1", version: 2, name: "前端" };
    expect(tagFormDirty(editing, "前端")).toBe(false);
    expect(tagFormDirty(editing, "设计")).toBe(true);
    expect(tagFormDirty(editing, "")).toBe(true);
  });
});

describe("shouldConfirmTargetSwitch (FR-06.2/4)", () => {
  it("never confirms a re-click of the current target, dirty or not", () => {
    expect(shouldConfirmTargetSwitch(true, "a", "a")).toBe(false);
    expect(shouldConfirmTargetSwitch(false, "a", "a")).toBe(false);
  });

  it("confirms only when switching away with real unsaved changes", () => {
    expect(shouldConfirmTargetSwitch(false, "a", "b")).toBe(false);
    expect(shouldConfirmTargetSwitch(false, null, "b")).toBe(false);
    expect(shouldConfirmTargetSwitch(true, "a", "b")).toBe(true);
    expect(shouldConfirmTargetSwitch(true, null, "b")).toBe(true);
  });
});
