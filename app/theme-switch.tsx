"use client";

import { useEffect, useRef } from "react";
import ActionIcon from "./action-icon";

export default function ThemeSwitch() {
  const select = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (select.current) {
      select.current.value = document.documentElement.dataset.theme ?? "system";
    }
  }, []);

  return (
    <label className="stan-naturalny-button icon-control stan-naturalny-theme" title="Motyw">
      <ActionIcon name="theme" />
      <select
        ref={select}
        aria-label="Motyw"
        defaultValue="system"
        onChange={({ currentTarget: { value } }) => {
          document.documentElement.dataset.theme = value;
          try {
            localStorage.setItem("stan-naturalny-theme", value);
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
