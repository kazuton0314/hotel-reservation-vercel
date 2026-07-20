/** 自端末の保存操作中は Realtime 通知を抑止する */
let silenceUntil = 0;

export function markLocalDataMutation(durationMs = 20_000) {
  const until = Date.now() + durationMs;
  if (until > silenceUntil) silenceUntil = until;
}

export function isLocalDataMutationActive() {
  return Date.now() < silenceUntil;
}
