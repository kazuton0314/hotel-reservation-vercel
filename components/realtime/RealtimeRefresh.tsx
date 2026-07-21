"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { isLocalDataMutationActive } from "@/lib/utils/local-mutation";
import { showInfoToast } from "@/lib/utils/toast";

type Props = {
  tables: string[];
  label?: string;
  notify?: boolean;
};

const GCAL_ONLY_RESERVATION_FIELDS = new Set(["gcal_event_id", "updated_at"]);

function shouldIgnoreRealtimePayload(
  table: string,
  payload: {
    eventType?: string;
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  }
): boolean {
  if (payload.eventType !== "UPDATE") return false;
  const next = payload.new ?? {};
  const prev = payload.old ?? {};
  const changedKeys = Object.keys(next).filter((key) => next[key] !== prev[key]);
  if (!changedKeys.length) return true;

  if (table === "reservations") {
    return changedKeys.every((key) => GCAL_ONLY_RESERVATION_FIELDS.has(key));
  }
  return false;
}

export function RealtimeRefresh({
  tables,
  label = "データ",
  notify = false,
}: Props) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedUntil = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`refresh:${tables.join(",")}`);

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // 一括保存の複数 UPDATE をまとめて 1 回の refresh / 通知にする
      timer.current = setTimeout(() => {
        router.refresh();
        if (!notify) return;
        if (isLocalDataMutationActive()) return;
        const now = Date.now();
        if (now < notifiedUntil.current) return;
        notifiedUntil.current = now + 30_000;
        showInfoToast(`${label}が更新されました`);
      }, 1200);
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (isLocalDataMutationActive()) return;
          if (shouldIgnoreRealtimePayload(table, payload)) return;
          scheduleRefresh();
        }
      );
    }

    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [tables, label, notify, router]);

  return null;
}
