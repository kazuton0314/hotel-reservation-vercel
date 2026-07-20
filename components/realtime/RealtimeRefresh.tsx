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
        scheduleRefresh
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
