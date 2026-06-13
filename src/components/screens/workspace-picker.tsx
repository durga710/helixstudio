"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";

interface WsOption {
  id: string;
  name: string;
  mode: string;
}

export function WorkspacePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams.get("w") ?? "";
  const [options, setOptions] = useState<WsOption[]>([]);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d) => {
        const list: WsOption[] = (d?.data ?? []).map((w: { id: string; name: string; mode: string }) => ({
          id: w.id,
          name: w.name,
          mode: w.mode,
        }));
        setOptions(list);
        // Auto-select first workspace if none selected and list is non-empty.
        if (!selected && list.length > 0) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("w", list[0]!.id);
          router.replace(`?${params.toString()}`);
        }
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (options.length === 0) return null;

  function onChange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("w", id);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <FolderOpen className="h-[14px] w-[14px] shrink-0 text-txt3" strokeWidth={1.7} />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-lg border border-border2 bg-panel px-2.5 py-1.5 font-sans text-[12.5px] text-txt outline-none focus:border-accent"
        aria-label="Select workspace"
      >
        {!selected && <option value="">Select workspace…</option>}
        {options.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
