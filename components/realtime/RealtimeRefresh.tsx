"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const notified = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`refresh:${tables.join(",")}`);

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        if (notify && !notified.current) {
          notified.current = true;
          showInfoToast(`${label}が更新されました`);
          setTimeout(() => {
            notified.current = false;
          }, 8000);
        }
      }, 600);
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
