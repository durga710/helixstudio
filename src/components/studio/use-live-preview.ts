/* eslint-disable react-hooks/set-state-in-effect -- compose-on-change effect sets state after async work by design (extracted from workspace-panel) */
"use client";

import { useEffect, useRef, useState } from "react";
import { composePreviewHtml } from "@/lib/preview-html";

/**
 * Live preview composer: takes the entry HTML and inlines its RELATIVE css/js
 * references from workspace files (preferring unsaved edits, then loaded
 * content, then a fresh fetch) so multi-file static apps run in one sandboxed
 * iframe. A monotonic sequence guards against out-of-order async results.
 */
export function useLivePreview({
  tab,
  previewEntry,
  previewNonce,
  dirty,
  contents,
  fetchContent,
}: {
  tab: string;
  previewEntry: string | null;
  previewNonce: number;
  dirty: Record<string, string>;
  contents: Record<string, string>;
  fetchContent: (path: string) => Promise<string | null>;
}) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<string | null>(null);
  const composeSeq = useRef(0);

  useEffect(() => {
    if (tab !== "preview") return;
    if (!previewEntry) {
      setPreviewHtml(null);
      setPreviewInfo(null);
      return;
    }
    const seq = ++composeSeq.current;
    (async () => {
      const getFile = async (path: string): Promise<string | null> => {
        if (dirty[path] !== undefined) return dirty[path];
        if (contents[path] !== undefined) return contents[path];
        return fetchContent(path);
      };

      const composed = await composePreviewHtml(previewEntry, getFile);
      if (seq !== composeSeq.current) return;
      if (!composed) {
        setPreviewHtml(null);
        setPreviewInfo("Couldn't load the page.");
        return;
      }

      setPreviewHtml(composed.html);
      setPreviewInfo(
        `${previewEntry}${composed.inlined.length ? ` + ${composed.inlined.length} inlined asset(s)` : ""}`,
      );
    })();
  }, [tab, previewEntry, previewNonce, dirty, contents, fetchContent]);

  return { previewHtml, previewInfo };
}
