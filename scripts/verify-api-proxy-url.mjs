import assert from "node:assert/strict";
import { normalizeBackendApiBase } from "../frontend/src/lib/server-api-url.ts";

const expected = "https://puppyruby-api.example.com/api/v1";

for (const value of [
  "https://puppyruby-api.example.com",
  "https://puppyruby-api.example.com/",
  "https://puppyruby-api.example.com///",
  "https://puppyruby-api.example.com/api",
  "https://puppyruby-api.example.com/api/",
  "https://puppyruby-api.example.com/api/v1",
  "https://puppyruby-api.example.com/api/v1///",
  "  https://puppyruby-api.example.com/api/v1/  ",
]) {
  assert.equal(normalizeBackendApiBase(value), expected, value);
}

assert.equal(normalizeBackendApiBase(), "http://127.0.0.1:8080/api/v1");

for (const value of [
  "not-a-url",
  "ftp://puppyruby-api.example.com",
  "https://user:password@puppyruby-api.example.com",
  "https://puppyruby-api.example.com/api/v2",
  "https://puppyruby-api.example.com/production",
  "https://puppyruby-api.example.com?version=1",
  "https://puppyruby-api.example.com#api",
]) {
  assert.throws(() => normalizeBackendApiBase(value), /API_URL/, value);
}

console.log("Vercel API proxy URL normalization verified.");
