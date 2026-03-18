/** Options for HTML to Markdown conversion. */
export interface HtmlToMarkdownOptions {
  /** Remove navigation elements, forms, headers, footers. */
  cleanContent?: boolean;
  /** Skip images during conversion. */
  skipImages?: boolean;
}
