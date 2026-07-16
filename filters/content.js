// Detect Prism-highlighted code blocks so syntax CSS is loaded only on pages
// that need it. The syntaxhighlight plugin emits language- classes on the
// <code> element. Guards non-string input by returning false.
export function hasCodeBlocks(content) {
  if (typeof content !== "string") {
    return false;
  }
  return /<pre[^>]*><code[^>]*class="[^"]*language-/.test(content);
}
