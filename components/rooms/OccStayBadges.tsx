import {
  formatBbqBadgeLabel,
  formatChannelBadgeLabel,
  formatSomenBadgeLabel,
} from "@/lib/utils/occ-display";

export function hasOccStayBadges({
  bbq,
  somen,
  channel,
}: {
  bbq?: string | null;
  somen?: string | null;
  channel?: string | null;
}): boolean {
  return Boolean(
    formatBbqBadgeLabel(bbq) ||
      formatSomenBadgeLabel(somen) ||
      formatChannelBadgeLabel(channel)
  );
}

/** 部屋割カード／当日部屋ボード共通。BBQ要の隣にそうめん要を出す */
export function OccStayBadges({
  bbq,
  somen,
  channel,
}: {
  bbq?: string | null;
  somen?: string | null;
  channel?: string | null;
}) {
  const bbqLabel = formatBbqBadgeLabel(bbq);
  const somenLabel = formatSomenBadgeLabel(somen);
  const channelLabel = formatChannelBadgeLabel(channel);
  if (!bbqLabel && !somenLabel && !channelLabel) return null;

  return (
    <span className="occ-stay-badges">
      {bbqLabel ? (
        <span className="meta-badge meta-bbq">{bbqLabel}</span>
      ) : null}
      {somenLabel ? (
        <span className="meta-badge meta-somen">{somenLabel}</span>
      ) : null}
      {channelLabel ? (
        <span className="meta-badge meta-airbnb">{channelLabel}</span>
      ) : null}
    </span>
  );
}
