"use client";

import React, { useState, useRef, useEffect } from "react";

export interface SelectOption {
  value: string;
  label: string;
  count?: number;
  icon?: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  prefix?: string;
  className?: string;
  size?: "sm" | "md";
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  prefix = "",
  className = "",
  size = "md",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  const displayLabel = selectedOption
    ? `${prefix}${selectedOption.label}`
    : placeholder;

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center justify-between gap-2.5 rounded-full bg-white border border-[#D5C7B2] font-semibold text-[#3A332C] hover:border-[#E65A00] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65A00] cursor-pointer select-none shadow-xs ${
          size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-xs sm:text-sm"
        } ${isOpen ? "border-[#E65A00] ring-2 ring-[#E65A00]/10" : ""}`}
      >
        <span className="truncate max-w-[140px] text-left">
          {displayLabel}
        </span>
        <svg
          className={`w-4 h-4 text-[#8C8375] transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-[#E65A00]" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-2xl bg-[#FFFDF8] border border-[#E2D6C5] shadow-xl py-1.5 animate-scale-up">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm text-left font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#FFF5EE] text-[#E65A00] font-bold"
                    : "text-[#3A332C] hover:bg-[#FAF2E8]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {prefix && option.value !== "ALL" && (
                    <span className="text-[#E65A00]/70 font-bold">{prefix}</span>
                  )}
                  <span className="truncate">{option.label}</span>
                </div>

                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {typeof option.count === "number" && (
                    <span className="text-xs text-[#8C8375] font-mono">
                      {option.count}
                    </span>
                  )}
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-[#E65A00]" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
