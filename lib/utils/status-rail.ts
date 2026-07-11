export type StatusRailNodeState = "done" | "current" | "pending" | "inactive";

export type StatusRailStep = { id: string; label: string };

export type StatusRailModel = {
  mainStates: StatusRailNodeState[];
  lineDone: boolean[];
  branchState: StatusRailNodeState;
  isBranch: boolean;
  branchLabel: string;
};

export function buildStatusRailModel(
  mainSteps: StatusRailStep[],
  branchStep: StatusRailStep,
  currentId: string
): StatusRailModel {
  const current = String(currentId || "");
  const isBranch = current === branchStep.id;
  let mainIdx = -1;
  mainSteps.forEach((step, i) => {
    if (step.id === current) mainIdx = i;
  });

  const mainStates: StatusRailNodeState[] = mainSteps.map((_, i) => {
    if (isBranch) return i === 0 ? "done" : "inactive";
    if (mainIdx >= 0) {
      if (i < mainIdx) return "done";
      if (i === mainIdx) return "current";
      return "pending";
    }
    return "inactive";
  });

  const lineDone = mainSteps.slice(0, -1).map((_, i) => {
    if (isBranch) return i === 0;
    return mainIdx >= 0 && i < mainIdx;
  });

  return {
    mainStates,
    lineDone,
    branchState: isBranch ? "current" : "inactive",
    isBranch,
    branchLabel: branchStep.label,
  };
}

export const REQUEST_STATUS_RAIL_MAIN: StatusRailStep[] = [
  { id: "リクエスト", label: "リクエスト" },
  { id: "承認済", label: "承認済" },
];

export const REQUEST_STATUS_RAIL_BRANCH: StatusRailStep = {
  id: "却下",
  label: "却下",
};

export const RESERVATION_STATUS_RAIL_MAIN: StatusRailStep[] = [
  { id: "仮予約", label: "仮予約" },
  { id: "確定", label: "確定" },
];

export const RESERVATION_STATUS_RAIL_BRANCH: StatusRailStep = {
  id: "キャンセル",
  label: "キャンセル",
};

/** 本予約連携済は承認済レール上に表示 */
export function normalizeRequestStatusForRail(status: string): string {
  return status === "本予約連携済" ? "承認済" : status;
}
