"use client";

import { useEffect } from "react";
import { syncMailLogStatusesAction } from "@/lib/actions/mail-logs";

export function MailTimelineStatusSync({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  useEffect(() => {
    void syncMailLogStatusesAction(entityType, entityId);
  }, [entityType, entityId]);

  return null;
}
