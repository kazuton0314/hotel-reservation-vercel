import {
  taskChipClassName,
  type TaskChipState,
} from "@/lib/utils/task-chip";

type Props = {
  label: string;
  state: TaskChipState;
  title?: string;
};

/** 色だけで状態を示す共通チップ（ラベル固定・接尾辞なし） */
export function TaskChip({ label, state, title }: Props) {
  return (
    <span className={taskChipClassName(state)} title={title}>
      {label}
    </span>
  );
}
