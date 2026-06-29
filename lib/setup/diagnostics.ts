import { FORM_SOURCES } from "@/lib/config/forms";
import { fetchSheetRows } from "@/lib/sheets/client";
import { createAdminClient } from "@/lib/supabase/server";
import { isGoogleSheetsReady, isSupabaseReady } from "@/lib/setup/env";

export type DiagnosticResult = {
  name: string;
  ok: boolean;
  message: string;
};

export async function runSupabaseDiagnostic(): Promise<DiagnosticResult> {
  if (!isSupabaseReady()) {
    return {
      name: "Supabase",
      ok: false,
      message: "環境変数が不足しています",
    };
  }

  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true });

    if (error) {
      return { name: "Supabase", ok: false, message: error.message };
    }
    return {
      name: "Supabase",
      ok: true,
      message: `接続 OK（予約 ${count ?? 0} 件）`,
    };
  } catch (e) {
    return {
      name: "Supabase",
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

async function probeSpreadsheet(
  label: string,
  spreadsheetId: string,
  sheetName: string,
  columnCount: number
): Promise<DiagnosticResult> {
  try {
    const { headers, rows } = await fetchSheetRows(
      spreadsheetId,
      sheetName,
      columnCount
    );
    return {
      name: label,
      ok: true,
      message: `読取 OK（ヘッダー ${headers.length} 列 / データ ${rows.length} 行）`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = msg.includes("403") || msg.includes("permission")
      ? " → スプシにサービスアカウントを閲覧者で共有してください"
      : "";
    return {
      name: label,
      ok: false,
      message: msg + hint,
    };
  }
}

export async function runGoogleSheetsDiagnostics(): Promise<DiagnosticResult[]> {
  if (!isGoogleSheetsReady()) {
    return [
      {
        name: "Google Sheets",
        ok: false,
        message: "サービスアカウントの環境変数が未設定です",
      },
    ];
  }

  const booking = FORM_SOURCES.booking;
  const request = FORM_SOURCES.request;

  return Promise.all([
    probeSpreadsheet(
      "本予約テストスプシ",
      booking.spreadsheetId,
      booking.sheetName,
      booking.dataColumnCount
    ),
    probeSpreadsheet(
      "リクエストテストスプシ",
      request.spreadsheetId,
      request.sheetName,
      request.dataColumnCount
    ),
  ]);
}

export async function runAllDiagnostics(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  results.push(await runSupabaseDiagnostic());
  results.push(...(await runGoogleSheetsDiagnostics()));
  return results;
}
