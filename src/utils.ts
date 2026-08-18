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

// Zoho/Outlook/Gmail all mark the start of a quoted reply chain differently.
// Every email in a Zoho thread carries the entire prior conversation inline, so
// cutting at the first marker keeps only what the sender actually wrote.
const HTML_QUOTE_MARKERS = [
  /<blockquote/i,
  /<b>\s*(?:Fra|From|Van|De|Von)\s*:\s*<\/b>/i,
  /<div[^>]+class="[^"]*gmail_quote/i,
  /-{3,}\s*(?:Original Message|Opprinnelig melding|Forwarded message)/i,
];

const TEXT_QUOTE_MARKERS = [
  /^\s*(?:On|Den|Am|El|Le)\b.{0,160}\b(?:wrote|skrev|schrieb|escribió|a écrit)\s*:\s*$/im,
  /^\s*-{3,}\s*(?:Original Message|Opprinnelig melding|Forwarded message)/im,
  /^\s*(?:Fra|From|Van|Von)\s*:.*\n\s*(?:Sendt|Sent|Verzonden|Gesendet)\s*:/im,
];

function firstMarkerIndex(text: string, markers: RegExp[]): number {
  let cut = -1;
  for (const re of markers) {
    const m = text.match(re);
    if (m?.index !== undefined && (cut === -1 || m.index < cut)) cut = m.index;
  }
  return cut;
}

/**
 * Drop the quoted-reply chain from an email body, returning plain text.
 * `trimmed` reports whether anything was cut, so callers can tell the model
 * that a fuller version exists behind `includeQuoted`.
 */
export function toCleanText(html: string): { text: string; trimmed: boolean } {
  const full = htmlToText(html);
  if (!full) return { text: "", trimmed: false };

  // Cut in HTML first (markers survive intact), then again in text as a fallback
  // for clients whose quote header carries no distinctive tags.
  const htmlCut = firstMarkerIndex(html, HTML_QUOTE_MARKERS);
  const candidate = htmlCut > 0 ? htmlToText(html.slice(0, htmlCut)) : full;

  const textCut = firstMarkerIndex(candidate, TEXT_QUOTE_MARKERS);
  const cut = textCut > 0 ? candidate.slice(0, textCut) : candidate;

  const lines = cut.split("\n").filter((line) => !/^\s*>/.test(line));
  // An <hr> above the quote header renders as a rule; drop it and any other
  // separator left dangling by the cut.
  while (lines.length && /^[\s\-_=*]*$/.test(lines[lines.length - 1])) lines.pop();
  const text = lines.join("\n").trim();

  // A marker at the very top means the whole body is quoted material — keep the
  // full text rather than returning nothing.
  if (!text) return { text: full, trimmed: false };
  return { text, trimmed: text.length < full.length };
}

/** Whitespace-insensitive prefix used to confirm two entries are the same email. */
export function contentFingerprint(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
}

/** Accept a bare ticket ID or any Zoho Desk URL containing /tickets/<id>. */
export function parseTicketId(input: string): string {
  if (!input) return "";
  const urlMatch = input.match(/\/tickets\/(?:details\/)?(\d+)/);
  if (urlMatch) return urlMatch[1];
  const tail = input.trim().match(/(\d{6,})\s*$/);
  return tail ? tail[1] : input.trim();
}

/** Run an async mapper over items with a bounded number of in-flight calls. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
