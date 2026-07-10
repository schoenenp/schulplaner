import {
  BADGE_TONE_CLASSES,
  statusMeta,
  type BadgeTone,
} from "@/util/status-labels";

type StatusBadgeProps = {
  status: string;
  map: Record<string, { label: string; tone: BadgeTone }>;
};

export default function StatusBadge({ status, map }: StatusBadgeProps) {
  const meta = statusMeta(map, status);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONE_CLASSES[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}
