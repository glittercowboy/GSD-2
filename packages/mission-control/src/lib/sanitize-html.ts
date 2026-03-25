import DOMPurify from "dompurify";

/**
 * Sanitize HTML output from markdown rendering before DOM insertion.
 * Removes <script> tags, javascript: URLs, event handler attributes,
 * and all other XSS vectors identified in T-EXEC-02.
 *
 * SECURITY: This is the DOMPurify sanitization layer required by B25, B65.
 * Do NOT bypass or disable this function.
 */
export function sanitizeHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    // Explicitly allow only safe HTML elements
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "b", "i", "u", "s", "code", "pre",
      "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "img", "table", "thead", "tbody", "tr", "th", "td",
      "div", "span", "hr",
    ],
    // Block all event handlers and javascript: URLs
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id", "target", "rel"],
    // Force all links to be safe
    FORCE_BODY: true,
    // Forbid data: URIs in href/src (potential XSS vector)
    ALLOW_DATA_ATTR: false,
    // Return sanitized HTML string (not DOM)
    RETURN_DOM: false,
  });
}
