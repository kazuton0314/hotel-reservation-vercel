import assert from "node:assert/strict";
import {
  buildCompanionFormUrl,
  isDeploymentPlatformHost,
  resolveGuestAppBaseUrl,
} from "../lib/utils/companion-form-url";

function testDeploymentHost() {
  assert.equal(isDeploymentPlatformHost("hotel-reservation-vercel-ashen.vercel.app"), true);
  assert.equal(isDeploymentPlatformHost("https://foo.vercel.app/path"), true);
  assert.equal(isDeploymentPlatformHost("yoyaku.midorinotokeidai.com"), false);
  assert.equal(isDeploymentPlatformHost("localhost:3000"), false);
}

function testGuestBaseUrl() {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://yoyaku.example.com";
  assert.equal(resolveGuestAppBaseUrl(), "https://yoyaku.example.com");
  assert.equal(
    resolveGuestAppBaseUrl(null, "https://preview.vercel.app"),
    "https://yoyaku.example.com"
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://bad.vercel.app";
  assert.equal(resolveGuestAppBaseUrl(), "");
  process.env.NEXT_PUBLIC_APP_URL = prev;
}

function testCompanionUrl() {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://yoyaku.example.com";
  assert.equal(
    buildCompanionFormUrl("ABCD-1234"),
    "https://yoyaku.example.com/companions/ABCD-1234"
  );
  process.env.NEXT_PUBLIC_APP_URL = prev;
}

testDeploymentHost();
testGuestBaseUrl();
testCompanionUrl();
console.log("verify-companion-form-url: ok");
