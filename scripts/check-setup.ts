import { runAllDiagnostics } from "@/lib/setup/diagnostics";
import { getSetupChecks, getServiceAccountEmailForSharing } from "@/lib/setup/env";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function main() {
  console.log("=== みどりの時計台 予約管理 — セットアップ確認 ===\n");

  const checks = getSetupChecks();
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`${mark} ${c.label}: ${c.detail}`);
    if (!c.ok && c.userAction) {
      console.log(`    → ${c.userAction}`);
    }
  }

  const saEmail = getServiceAccountEmailForSharing();
  if (saEmail) {
    console.log("\n--- スプシ共有用メール（コピーして閲覧者に追加）---");
    console.log(saEmail);
  } else {
    console.log("\n--- スプシ共有用メール ---");
    console.log("（サービスアカウント作成後に表示されます）");
  }

  console.log("\n--- 接続テスト ---");
  const diagnostics = await runAllDiagnostics();
  for (const d of diagnostics) {
    const mark = d.ok ? "✓" : "✗";
    console.log(`${mark} ${d.name}: ${d.message}`);
  }

  const allOk = checks.every((c) =>
    ["cron_secret"].includes(c.id) ? true : c.ok
  );
  const diagOk = diagnostics.every((d) => d.ok);

  console.log("\n--- 次のコマンド ---");
  if (diagOk) {
    console.log("npm run sync:forms   # フォーム取込");
  } else if (isGooglePartial(checks)) {
    console.log("1. GCP でサービスアカウント + JSON 鍵");
    console.log("2. .env.local に EMAIL / PRIVATE_KEY を追加");
    console.log("3. テストスプシ2つに閲覧者で共有");
    console.log("4. npm run check:setup を再実行");
  } else {
    console.log("npm run check:setup を再実行");
  }

  process.exit(allOk && diagOk ? 0 : 1);
}

function isGooglePartial(
  checks: ReturnType<typeof getSetupChecks>
): boolean {
  const email = checks.find((c) => c.id === "google_sa_email")?.ok;
  const key = checks.find((c) => c.id === "google_sa_key")?.ok;
  return !email || !key;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
