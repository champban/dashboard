import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const AUTH_KEY = "sb-qjaywadzvwvcspdsjxth-auth-token";
const LOOKALIKE_KEY = `${AUTH_KEY}-copy`;
const FAKE_SESSION = {
  access_token: "fake-access-token-for-storage-test",
  refresh_token: "fake-refresh-token-for-storage-test",
  user: { id: "00000000-0000-4000-8000-000000000000" },
};

const fullSecurity = fs.readFileSync("build/security-bootstrap.js", "utf8");
const mobile = fs.readFileSync("mobile/index.html", "utf8");
const mobileSecurity = mobile.match(
  /<script id="mtp-security-bootstrap">([\s\S]*?)<\/script>/,
)?.[1];

assert.ok(mobileSecurity, "mobile security bootstrap must exist");
assert.match(fullSecurity, new RegExp(`SUPABASE_AUTH_STORAGE_KEY='${AUTH_KEY}'`));
assert.match(mobileSecurity, new RegExp(`SUPABASE_AUTH_STORAGE_KEY='${AUTH_KEY}'`));

function storedJson(window, key) {
  return JSON.parse(window.localStorage.getItem(key));
}

function exercise(label, script) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "https://champban.github.io/dashboard/",
  });
  const { window } = dom;

  // Existing storage is scanned during bootstrap, so guard both stored sessions
  // created before page load and sessions refreshed later through setItem.
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(FAKE_SESSION));
  window.localStorage.setItem("planner-before-bootstrap", JSON.stringify({
    access_token: "must-be-redacted",
    nested: { refreshToken: "must-also-be-redacted" },
    title: "keep me",
  }));
  window.eval(script);

  assert.equal(storedJson(window, AUTH_KEY).access_token, FAKE_SESSION.access_token,
    `${label}: existing Supabase access token must survive bootstrap`);
  assert.equal(storedJson(window, AUTH_KEY).refresh_token, FAKE_SESSION.refresh_token,
    `${label}: existing Supabase refresh token must survive bootstrap`);

  window.localStorage.setItem(AUTH_KEY, JSON.stringify({
    ...FAKE_SESSION,
    access_token: "fake-refreshed-access-token",
    refresh_token: "fake-refreshed-refresh-token",
  }));
  assert.equal(storedJson(window, AUTH_KEY).access_token, "fake-refreshed-access-token",
    `${label}: refreshed Supabase access token must be persisted`);
  assert.equal(storedJson(window, AUTH_KEY).refresh_token, "fake-refreshed-refresh-token",
    `${label}: refreshed Supabase refresh token must be persisted`);

  const before = storedJson(window, "planner-before-bootstrap");
  assert.equal(before.access_token, "",
    `${label}: pre-existing non-auth access token must be redacted`);
  assert.equal(before.nested.refreshToken, "",
    `${label}: nested non-auth refresh token must be redacted`);
  assert.equal(before.title, "keep me",
    `${label}: non-secret data must remain intact`);

  window.localStorage.setItem("planner-after-bootstrap", JSON.stringify({
    idToken: "must-be-redacted",
    nested: { client_secret: "must-also-be-redacted" },
  }));
  const after = storedJson(window, "planner-after-bootstrap");
  assert.equal(after.idToken, "",
    `${label}: later non-auth ID token must be redacted`);
  assert.equal(after.nested.client_secret, "",
    `${label}: later nested client secret must be redacted`);

  window.localStorage.setItem(LOOKALIKE_KEY, JSON.stringify(FAKE_SESSION));
  const lookalike = storedJson(window, LOOKALIKE_KEY);
  assert.equal(lookalike.access_token, "",
    `${label}: lookalike storage key must not bypass redaction`);
  assert.equal(lookalike.refresh_token, "",
    `${label}: exact-key exemption must remain narrow`);

  dom.window.close();
}

exercise("Full", fullSecurity);
exercise("Mobile", mobileSecurity);

console.log("Supabase auth storage security: PASS");
