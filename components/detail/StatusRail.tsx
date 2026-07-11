import type { StatusRailModel, StatusRailStep } from "@/lib/utils/status-rail";
import { buildStatusRailModel } from "@/lib/utils/status-rail";

type Props = {
  mainSteps: StatusRailStep[];
  branchStep: StatusRailStep;
  currentId: string;
};

function RailNode({ label, state }: { label: string; state: string }) {
  return (
    <div className={`status-rail-node is-${state}`}>
      <span className="status-rail-dot" aria-hidden />
      <span className="status-rail-label">{label}</span>
    </div>
  );
}

export function StatusRail({ mainSteps, branchStep, currentId }: Props) {
  const model: StatusRailModel = buildStatusRailModel(
    mainSteps,
    branchStep,
    currentId
  );

  const mainNodes = mainSteps.flatMap((step, i) => {
    const items = [
      <RailNode key={step.id} label={step.label} state={model.mainStates[i]} />,
    ];
    if (i < mainSteps.length - 1) {
      items.push(
        <div
          key={`line-${step.id}`}
          className={`status-rail-line${model.lineDone[i] ? " is-done" : ""}`}
        />
      );
    }
    return items;
  });

  return (
    <>
      <div className="status-rail">
        <div className="status-rail-main">{mainNodes}</div>
        <div className="status-rail-divider" aria-hidden />
        <div className="status-rail-branch">
          <RailNode label={branchStep.label} state={model.branchState} />
        </div>
      </div>
      {model.isBranch ? (
        <p className="status-rail-note">
          「{model.branchLabel}」のため、通常フローはここで終了しています
        </p>
      ) : null}
    </>
  );
}
