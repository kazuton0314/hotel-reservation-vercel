import { config } from "dotenv";
import { resolve } from "path";

/** スクリプト用: .env.local を読み込む */
export function loadEnvLocal() {
  config({ path: resolve(process.cwd(), ".env.local") });
}
