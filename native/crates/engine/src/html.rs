//! HTML to Markdown conversion via N-API.
//!
//! Wraps `html-to-markdown-rs` and exposes it as a JS-callable N-API export.

use html_to_markdown_rs::{convert, ConversionOptions, PreprocessingOptions, PreprocessingPreset};
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Options for HTML to Markdown conversion.
#[napi(object)]
#[derive(Debug, Default)]
pub struct HtmlToMarkdownOptions {
    /// Remove navigation elements, forms, headers, footers.
    #[napi(js_name = "cleanContent")]
    pub clean_content: Option<bool>,
    /// Skip images during conversion.
    #[napi(js_name = "skipImages")]
    pub skip_images: Option<bool>,
}

/// Convert HTML source to Markdown with optional preprocessing.
///
/// Strips boilerplate (nav, forms, headers, footers) when `cleanContent` is true.
/// Returns the Markdown string.
#[napi(js_name = "htmlToMarkdown")]
pub fn html_to_markdown(html: String, options: Option<HtmlToMarkdownOptions>) -> Result<String> {
    let options = options.unwrap_or_default();
    let clean_content = options.clean_content.unwrap_or(false);
    let skip_images = options.skip_images.unwrap_or(false);

    let conversion_opts = ConversionOptions {
        skip_images,
        preprocessing: PreprocessingOptions {
            enabled: clean_content,
            preset: PreprocessingPreset::Aggressive,
            remove_navigation: true,
            remove_forms: true,
        },
        ..Default::default()
    };

    convert(&html, Some(conversion_opts))
        .map_err(|err| Error::from_reason(format!("HTML conversion error: {err}")))
}
