import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "./NoteEditor";

describe("NoteEditor", () => {
  describe("sanitizeHtml - XSS Prevention", () => {
    it("strips script tags", () => {
      expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("");
      expect(sanitizeHtml("Hello<script>alert('xss')</script>World")).toBe(
        "HelloWorld",
      );
    });

    it("strips img tags with onerror handlers", () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe("");
      expect(sanitizeHtml('Before<img src="x" onerror="alert(1)">After')).toBe(
        "BeforeAfter",
      );
    });

    it("strips event handlers from all elements", () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Text</div>')).toBe("Text");
      expect(sanitizeHtml('<span onmouseover="alert(1)">Text</span>')).toBe(
        "Text",
      );
    });

    it("strips event handlers from bold tags", () => {
      // Bold content is kept, but onclick attribute is stripped
      expect(sanitizeHtml('<b onclick="alert(1)">Bold</b>')).toBe(
        "<b>Bold</b>",
      );
      expect(sanitizeHtml('<strong onload="alert(1)">Strong</strong>')).toBe(
        "<b>Strong</b>",
      );
    });

    it("strips iframe and object tags", () => {
      expect(sanitizeHtml('<iframe src="evil.com"></iframe>')).toBe("");
      expect(sanitizeHtml('<object data="evil.swf"></object>')).toBe("");
    });

    it("strips javascript: URLs", () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">Link</a>')).toBe(
        "Link",
      );
    });

    it("strips style tags", () => {
      expect(sanitizeHtml("<style>body{display:none}</style>Text")).toBe(
        "Text",
      );
    });

    it("strips inline styles", () => {
      expect(sanitizeHtml('<div style="background:url(evil)">Text</div>')).toBe(
        "Text",
      );
    });
  });

  describe("sanitizeHtml - Preserves Safe Content", () => {
    it("preserves plain text", () => {
      expect(sanitizeHtml("Hello World")).toBe("Hello World");
      expect(sanitizeHtml("Line 1\nLine 2")).toBe("Line 1\nLine 2");
    });

    it("preserves bold tags", () => {
      expect(sanitizeHtml("<b>Bold text</b>")).toBe("<b>Bold text</b>");
      expect(sanitizeHtml("Normal <b>bold</b> normal")).toBe(
        "Normal <b>bold</b> normal",
      );
    });

    it("normalizes strong to b tags", () => {
      expect(sanitizeHtml("<strong>Strong text</strong>")).toBe(
        "<b>Strong text</b>",
      );
    });

    it("preserves nested bold content", () => {
      expect(sanitizeHtml("<b>Outer <b>Inner</b> Outer</b>")).toBe(
        "<b>Outer <b>Inner</b> Outer</b>",
      );
    });

    it("handles empty input", () => {
      expect(sanitizeHtml("")).toBe("");
    });

    it("handles whitespace-only input", () => {
      expect(sanitizeHtml("   ")).toBe("   ");
    });
  });

  describe("sanitizeHtml - Complex Payloads", () => {
    it("handles nested malicious content", () => {
      expect(
        sanitizeHtml("<div><script>alert(1)</script><b>Safe</b></div>"),
      ).toBe("<b>Safe</b>");
    });

    it("handles malformed HTML", () => {
      expect(sanitizeHtml("<script>alert(1)")).toBe("");
      expect(sanitizeHtml("<b>Unclosed")).toBe("<b>Unclosed</b>");
    });

    it("handles mixed safe and unsafe content", () => {
      const input =
        '<b>Bold</b><script>evil()</script><div onclick="x">Text</div>';
      expect(sanitizeHtml(input)).toBe("<b>Bold</b>Text");
    });

    it("keeps encoded entities encoded so text never becomes live markup", () => {
      // Sanitized output is assigned to innerHTML, so un-escaping here would
      // turn text that merely looks like markup into real elements. Notably
      // "&lt;img src=x onerror=...&gt;" would become a live img with a handler
      // in every reader's browser once a Team Note is shared.
      expect(sanitizeHtml("&lt;script&gt;")).toBe("&lt;script&gt;");
      expect(sanitizeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe(
        "&lt;img src=x onerror=alert(1)&gt;",
      );
    });
  });
});
