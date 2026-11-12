"use client";

import { useEffect, useRef } from "react";

export default function ThemeSwitch() {
  const select = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (select.current) {
      select.current.value = document.documentElement.dataset.theme ?? "system";
    }
  }, []);

  return (
    <label className="nova-theme">
      <span>Motyw</span>
      <select
        ref={select}
        className="nova-field"
        defaultValue="system"
        onChange={({ currentTarget: { value } }) => {
          document.documentElement.dataset.theme = value;
          try {
            localStorage.setItem("studio-nova-theme", value);
          } catch {
            // The current selection still works when storage is unavailable.
          }
        }}
      >
        <option value="system">Systemowy</option>
        <option value="light">Jasny</option>
        <option value="dark">Ciemny</option>
      </select>
    </label>
  );
}
