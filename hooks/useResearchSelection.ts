"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchSelection } from "@studio/contracts/social-research";
import { loadResearchSelectionAction } from "@/app/(authenticated)/app/social/research/actions";

/** Keep the watchlist mounted; ignore out-of-order responses and preserve history/deep links. */
export function useResearchSelection(initial: ResearchSelection) {
  const [state, setState] = useState<{
    base: ResearchSelection;
    data: ResearchSelection;
    loading: string | null;
    error: string | null;
  }>({ base: initial, data: initial, loading: null, error: null });
  const sequence = useRef(0);
  const current =
    state.base === initial
      ? state
      : { base: initial, data: initial, loading: null, error: null };
  const load = async (url: URL, updateHistory: boolean) => {
    const accountId = url.searchParams.get("account") ?? initial.selected?.id;
    if (!accountId) return;
    const request = ++sequence.current;
    setState({ ...current, loading: accountId, error: null });
    try {
      const result = await loadResearchSelectionAction({
        accountId,
        historyPage: Number(url.searchParams.get("historyPage") ?? 0),
        observationId: url.searchParams.get("observation") ?? undefined,
      });
      if (request !== sequence.current) return;
      if (!result.ok) {
        setState({ ...current, loading: null, error: result.error });
        return;
      }
      if (updateHistory)
        window.history.pushState(null, "", url.pathname + url.search);
      setState({
        base: initial,
        data: result.data,
        loading: null,
        error: null,
      });
    } catch {
      if (request === sequence.current)
        setState({
          ...current,
          loading: null,
          error:
            "Account observations could not load. Select the account again to retry.",
        });
    }
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    sequence.current++;
  }, [initial]);
  useEffect(() => {
    const onPop = () => {
      void loadRef.current(new URL(window.location.href), false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      sequence.current = -1;
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return {
    ...current.data,
    loading: current.loading,
    error: current.error,
    select: (href: string) => load(new URL(href, window.location.href), true),
  };
}
