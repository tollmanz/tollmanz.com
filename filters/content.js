// Detect Prism-highlighted code blocks so syntax CSS is loaded only on pages
// that need it. The syntaxhighlight plugin emits language- classes on the
// <code> element. Guards non-string input by returning false.
export function hasCodeBlocks(content) {
  if (typeof content !== "string") {
    return false;
  }
  return /<pre[^>]*><code[^>]*class="[^"]*language-/.test(content);
}

// Split a front-matter string into paragraphs on blank lines. Talk abstracts
// live in front matter rather than the Markdown body, so they need splitting
// before they can be rendered as <p> elements. Guards empty and non-string
// input by returning an empty array.
export function paragraphs(str) {
  if (!str) {
    return [];
  }
  return String(str)
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
}
