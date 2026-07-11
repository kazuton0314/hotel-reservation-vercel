import type { SupabaseClient } from "@supabase/supabase-js";

export async function startImportJobRun(
  supabase: SupabaseClient,
  jobName: string,
  target?: string
) {
  const { data, error } = await supabase
    .from("import_job_runs")
    .insert({
      job_name: jobName,
      source: "script",
      target: target ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function finishImportJobRun(
  supabase: SupabaseClient,
  runId: string,
  payload: {
    status: "success" | "error";
    details?: Record<string, unknown>;
    errorMessage?: string;
  }
) {
  const { error } = await supabase
    .from("import_job_runs")
    .update({
      status: payload.status,
      details: payload.details ?? null,
      error_message: payload.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw error;
}
