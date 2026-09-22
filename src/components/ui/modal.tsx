import React from "react";
import { Button } from "./button";

export interface ModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  confirmPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Modal({
  isOpen,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  isDanger = false,
  confirmPending = false,
  onConfirm,
  onCancel,
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white rounded-3xl border border-[#E2D6C5] p-6 sm:p-8 max-w-md w-full shadow-xl relative animate-scale-up"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-xl font-bold text-[#1A1A1A] mb-3">{title}</h3>
        <p className="text-sm text-[#6B655C] leading-relaxed mb-6 whitespace-pre-wrap">
          {description}
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={confirmPending}>
            {cancelText}
          </Button>
          <Button
            variant={isDanger ? "danger" : "primary"}
            size="sm"
            pending={confirmPending}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
