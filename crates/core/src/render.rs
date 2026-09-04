//! Markdown to HTML: the one renderer every piece of HTML in the product
//! comes out of (design.md §3 "Body text is markdown, rendered by the
//! core" and "One renderer, two surfaces"). The store calls it as an entry
//! leaves, a module import and the Vault's preview will call it on demand,
//! and the page only ever inserts what it wrote.
//!
//! The dialect is Obsidian's, grown one transform at a time; this first
//! cut is plain GFM: tables, strikethrough, task lists, bare links. Raw
//! HTML in a body is dropped, not passed through, so the output holds
//! nothing this renderer did not write and the page may insert it as is.

use comrak::{Options, markdown_to_html};

/// Render `markdown` to HTML. Empty or blank input renders to nothing.
#[must_use]
pub fn render(markdown: &str) -> String {
    if markdown.trim().is_empty() {
        return String::new();
    }
    markdown_to_html(markdown, &options())
}

fn options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    // `render.unsafe` stays false: raw HTML and unsafe link schemes are
    // omitted, which is what keeps the output insertable without a second
    // sanitiser on the page.
    options
}

#[cfg(test)]
mod tests {
    use super::render;

    #[test]
    fn paragraphs_and_emphasis_render_as_html() {
        assert_eq!(
            render("You hurl a mote of fire.\n\n**Cantrip Upgrade.** The damage _grows_."),
            "<p>You hurl a mote of fire.</p>\n\
             <p><strong>Cantrip Upgrade.</strong> The damage <em>grows</em>.</p>\n"
        );
    }

    #[test]
    fn a_gfm_table_renders_with_alignment() {
        let html = render("| Degree | Benefit |\n|---|:-:|\n| Half | +2 |\n");
        assert!(html.starts_with("<table>"), "{html}");
        assert!(html.contains("<th align=\"center\">Benefit</th>"), "{html}");
        assert!(html.contains("<td>Half</td>"), "{html}");
    }

    #[test]
    fn headings_lists_and_hard_breaks_render() {
        let html = render("## Cover\n\n- one\n- two\n\nline one  \nline two");
        assert!(html.contains("<h2>Cover</h2>"), "{html}");
        assert!(
            html.contains("<ul>\n<li>one</li>\n<li>two</li>\n</ul>"),
            "{html}"
        );
        assert!(html.contains("line one<br />\nline two"), "{html}");
    }

    #[test]
    fn raw_html_and_unsafe_links_are_dropped() {
        let html = render("Hello <script>alert(1)</script> [x](javascript:alert(1))");
        assert!(!html.contains("<script>"), "{html}");
        assert!(!html.contains("javascript:"), "{html}");
        assert!(html.contains("Hello"), "{html}");
    }

    #[test]
    fn nothing_renders_to_nothing() {
        assert_eq!(render(""), "");
        assert_eq!(render("  \n\t"), "");
    }
}
