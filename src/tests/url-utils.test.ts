import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlockedUrl } from "../resources/extensions/search-the-web/url-utils.ts";

describe("isBlockedUrl — SSRF protection", () => {
  it("blocks localhost", () => {
    assert.equal(isBlockedUrl("http://localhost/admin"), true);
    assert.equal(isBlockedUrl("http://localhost:8080/"), true);
  });

  it("blocks 127.0.0.0/8", () => {
    assert.equal(isBlockedUrl("http://127.0.0.1/"), true);
    assert.equal(isBlockedUrl("http://127.0.0.2:3000/path"), true);
  });

  it("blocks 10.0.0.0/8 (private)", () => {
    assert.equal(isBlockedUrl("http://10.0.0.1/"), true);
    assert.equal(isBlockedUrl("http://10.255.255.255/"), true);
  });

  it("blocks 172.16-31.x.x (private)", () => {
    assert.equal(isBlockedUrl("http://172.16.0.1/"), true);
    assert.equal(isBlockedUrl("http://172.31.255.255/"), true);
  });

  it("blocks 192.168.x.x (private)", () => {
    assert.equal(isBlockedUrl("http://192.168.1.1/"), true);
    assert.equal(isBlockedUrl("http://192.168.0.100:9200/"), true);
  });

  it("blocks 169.254.x.x (link-local / cloud metadata)", () => {
    assert.equal(isBlockedUrl("http://169.254.169.254/latest/meta-data/"), true);
  });

  it("blocks cloud metadata hostnames", () => {
    assert.equal(isBlockedUrl("http://metadata.google.internal/computeMetadata/"), true);
  });

  it("blocks non-http protocols", () => {
    assert.equal(isBlockedUrl("file:///etc/passwd"), true);
    assert.equal(isBlockedUrl("ftp://internal.server/data"), true);
  });

  it("blocks invalid URLs", () => {
    assert.equal(isBlockedUrl("not-a-url"), true);
    assert.equal(isBlockedUrl(""), true);
  });

  it("allows public URLs", () => {
    assert.equal(isBlockedUrl("https://example.com"), false);
    assert.equal(isBlockedUrl("https://api.github.com/repos"), false);
    assert.equal(isBlockedUrl("http://docs.python.org/3/"), false);
  });

  it("allows public IPs", () => {
    assert.equal(isBlockedUrl("http://8.8.8.8/"), false);
    assert.equal(isBlockedUrl("https://1.1.1.1/"), false);
  });
});
