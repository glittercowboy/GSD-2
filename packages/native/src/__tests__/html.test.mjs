import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const addonDir = path.resolve(__dirname, "..", "..", "..", "..", "native", "addon");
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error("Native addon not found. Run `npm run build:native -w @gsd/native` first.");
  process.exit(1);
}

describe("native html: htmlToMarkdown()", () => {
  test("converts basic HTML to markdown", () => {
    const html = "<h1>Hello</h1><p>World</p>";
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("Hello"), "Should contain heading text");
    assert.ok(result.includes("World"), "Should contain paragraph text");
  });

  test("converts links to markdown links", () => {
    const html = '<p>Visit <a href="https://example.com">Example</a></p>';
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("[Example]"), "Should contain markdown link text");
    assert.ok(result.includes("(https://example.com)"), "Should contain markdown link URL");
  });

  test("converts lists to markdown", () => {
    const html = "<ul><li>First</li><li>Second</li><li>Third</li></ul>";
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("First"), "Should contain first item");
    assert.ok(result.includes("Second"), "Should contain second item");
    assert.ok(result.includes("Third"), "Should contain third item");
  });

  test("converts bold and italic", () => {
    const html = "<p><strong>bold</strong> and <em>italic</em></p>";
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("**bold**") || result.includes("__bold__"), "Should contain bold");
    assert.ok(result.includes("*italic*") || result.includes("_italic_"), "Should contain italic");
  });

  test("handles empty HTML", () => {
    const result = native.htmlToMarkdown("");
    assert.equal(typeof result, "string");
  });

  test("handles plain text", () => {
    const result = native.htmlToMarkdown("Just plain text");
    assert.ok(result.includes("Just plain text"), "Should preserve plain text");
  });

  test("accepts skipImages option", () => {
    const html = '<h1>Title</h1><p>Content with <img src="photo.jpg" alt="photo"> image</p>';
    const result = native.htmlToMarkdown(html, { skipImages: true });
    assert.ok(result.includes("Title"), "Should contain heading");
    assert.ok(result.includes("Content"), "Should contain paragraph text");
  });

  test("accepts cleanContent option", () => {
    const html = '<nav><a href="/home">Home</a></nav><main><h1>Article</h1><p>Body text.</p></main><footer>Copyright</footer>';
    const result = native.htmlToMarkdown(html, { cleanContent: true });
    assert.ok(result.includes("Article") || result.includes("Body text"), "Should contain main content");
  });

  test("converts code blocks", () => {
    const html = "<pre><code>const x = 1;</code></pre>";
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("const x = 1;"), "Should contain code content");
  });

  test("converts complex nested HTML", () => {
    const html = '<div><h2>Section</h2><p>Text with <a href="https://example.com"><strong>bold link</strong></a>.</p><ul><li>Item one</li><li>Item two</li></ul></div>';
    const result = native.htmlToMarkdown(html);
    assert.ok(result.includes("Section"), "Should contain heading");
    assert.ok(result.includes("example.com"), "Should contain link");
    assert.ok(result.includes("one"), "Should contain list items");
  });
});
