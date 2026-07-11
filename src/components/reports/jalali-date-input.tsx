"use client";

import { useEffect, useState } from "react";

type JalaliDateInputProps = {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function parseJalali(value: string): { y: string; m: string; d: string } {
  const parts = value.trim().replace(/-/g, "/").split("/");
  return {
    y: parts[0] ?? "",
    m: parts[1] ?? "",
    d: parts[2] ?? "",
  };
}

function joinJalali(y: string, m: string, d: string): string {
  if (!y && !m && !d) return "";
  const jy = y.padStart(4, "0").slice(0, 4);
  const jm = m.padStart(2, "0").slice(0, 2);
  const jd = d.padStart(2, "0").slice(0, 2);
  if (!jy.replace(/0/g, "")) return "";
  return `${jy}/${jm || "01"}/${jd || "01"}`;
}

export function JalaliDateInput({
  name: _name,
  value = "",
  onChange,
  placeholder,
  disabled,
  className,
}: JalaliDateInputProps) {
  const initial = parseJalali(value);
  const [y, setY] = useState(initial.y);
  const [m, setM] = useState(initial.m);
  const [d, setD] = useState(initial.d);

  useEffect(() => {
    const p = parseJalali(value);
    setY(p.y);
    setM(p.m);
    setD(p.d);
  }, [value]);

  function emit(nextY: string, nextM: string, nextD: string) {
    onChange?.(joinJalali(nextY, nextM, nextD));
  }

  return (
    <div className={`jalali-date-input ${className ?? ""}`.trim()}>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="سال"
          disabled={disabled}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-2 text-center text-sm"
          value={y}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            setY(v);
            emit(v, m, d);
          }}
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="ماه"
          disabled={disabled}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-2 text-center text-sm"
          value={m}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setM(v);
            emit(y, v, d);
          }}
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="روز"
          disabled={disabled}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-2 text-center text-sm"
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setD(v);
            emit(y, m, v);
          }}
        />
      </div>
      {placeholder ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">{placeholder}</p>
      ) : null}
    </div>
  );
}
