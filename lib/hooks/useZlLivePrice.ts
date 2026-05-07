"use client";

import { useEffect, useRef, useState } from "react";
import type { ZlLivePrice } from "@/lib/contracts/api";

const POLL_MS = 30_000; // 30s polling interval

export function useZlLivePrice() {
  const [live, setLive] = useState<ZlLivePrice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetchLive() {
      try {
        const res = await fetch("/api/zl/live", { cache: "no-store" });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        if (!mountedRef.current) return;
        if (json.ok && json.data) {
          setLive(json.data);
          setError(null);
        }
      } catch {
        if (mountedRef.current) setError("Network error");
      }
    }

    fetchLive();
    const id = setInterval(fetchLive, POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  return { live, error };
}
