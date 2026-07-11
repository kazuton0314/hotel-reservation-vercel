import { handleResendWebhook } from "@/lib/actions/resend-webhook";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("svix-signature");
    if (!signature) {
      return Response.json({ error: "missing signature" }, { status: 401 });
    }
    // Full Svix verification can be added when secret is configured.
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const result = await handleResendWebhook(payload as Parameters<typeof handleResendWebhook>[0]);
  return Response.json(result);
}
