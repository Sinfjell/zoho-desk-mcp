import { convert } from "html-to-text";

export function htmlToText(html: string): string {
  if (!html) return "";
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}
