"use client";

import { useState } from "react";
import { MarkdownPreview } from "@/components/site/markdown-preview";
import { adminInputClass } from "@/components/admin/form-field";

type Mode = "edit" | "preview";

/**
 * In-form Markdown editor with edit/preview toggle (UI spec §8.2). Preview
 * renders the current textarea value, including unsaved edits. Independent
 * `/admin/posts/[id]/preview` is unchanged.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  required,
  invalid,
  describedBy,
  allowedImageHosts,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  allowedImageHosts: readonly string[];
}) {
  const [mode, setMode] = useState<Mode>("edit");

  return (
    <div>
      <div className="mb-2 flex gap-1" role="tablist" aria-label="正文编辑与预览">
        <button
          type="button"
          role="tab"
          id={`${id}-tab-edit`}
          aria-selected={mode === "edit"}
          aria-controls={`${id}-panel`}
          onClick={() => setMode("edit")}
          className={`focus-surface rounded-md px-3 py-1.5 text-sm ${
            mode === "edit" ? "bg-accent text-white" : "bg-surface text-text hover:text-accent-text"
          }`}
        >
          编辑
        </button>
        <button
          type="button"
          role="tab"
          id={`${id}-tab-preview`}
          aria-selected={mode === "preview"}
          aria-controls={`${id}-panel`}
          onClick={() => setMode("preview")}
          className={`focus-surface rounded-md px-3 py-1.5 text-sm ${
            mode === "preview" ? "bg-accent text-white" : "bg-surface text-text hover:text-accent-text"
          }`}
        >
          预览
        </button>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${mode}`}>
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={18}
          required={required}
          hidden={mode !== "edit"}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={`${adminInputClass} h-auto py-2 font-mono text-sm leading-relaxed`}
        />
        {mode === "preview" ? (
          <div className="min-h-48 rounded-md border border-border bg-surface px-4 py-3">
            <MarkdownPreview content={value} allowedImageHosts={allowedImageHosts} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
