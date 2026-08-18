import { htmlToText } from "./utils.js";

interface MimePart {
  headers: Record<string, string>;
  body: string;
}

function splitHeaders(raw: string): MimePart {
  const sep = raw.search(/\r?\n\r?\n/);
  // No blank line means either a header-only message or a bare body; a leading
  // "Name: value" line is what tells the two apart.
  const hasHeaders = /^[\w-]+:\s/.test(raw);
  if (sep === -1 && !hasHeaders) return { headers: {}, body: raw };

  const headerBlock = sep === -1 ? raw : raw.slice(0, sep);
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }

  return { headers, body: sep === -1 ? "" : raw.slice(sep).replace(/^\r?\n\r?\n/, "") };
}

function decodeBody(part: MimePart): string {
  const encoding = (part.headers["content-transfer-encoding"] ?? "").toLowerCase();

  if (encoding === "base64") {
    return Buffer.from(part.body.replace(/\s/g, ""), "base64").toString("utf-8");
  }
  if (encoding === "quoted-printable") {
    return part.body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return part.body;
}

/** Decode RFC 2047 encoded-words (=?utf-8?B?...?=) that appear in headers. */
function decodeHeaderValue(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, data) => {
    try {
      const bytes = enc.toUpperCase() === "B"
        ? Buffer.from(data, "base64")
        : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) =>
            String.fromCharCode(parseInt(h, 16))), "binary");
      return bytes.toString(charset.toLowerCase() === "utf-8" ? "utf-8" : "latin1");
    } catch {
      return data;
    }
  });
}

function walkParts(part: MimePart, depth = 0): MimePart[] {
  const contentType = part.headers["content-type"] ?? "";
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary || depth > 5) return [part];

  return part.body
    .split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\r?\\n`))
    .slice(1)
    .flatMap((chunk) => (chunk.trim() ? walkParts(splitHeaders(chunk), depth + 1) : []));
}

/**
 * Extract the readable parts of a .eml attachment: key headers plus the best
 * available body (text/plain, else text/html rendered to text).
 */
export function parseEml(raw: string): {
  headers: Record<string, string | null>;
  body: string;
  attachmentNames: string[];
} {
  const root = splitHeaders(raw);
  const parts = walkParts(root);

  const pick = (type: string) =>
    parts.find((p) => (p.headers["content-type"] ?? "").toLowerCase().startsWith(type));

  const plain = pick("text/plain");
  const html = pick("text/html");
  const body = plain
    ? decodeBody(plain).trim()
    : html
      ? htmlToText(decodeBody(html))
      : decodeBody(root).trim();

  const attachmentNames = parts
    .map((p) => (p.headers["content-disposition"] ?? "").match(/filename="?([^";]+)"?/i)?.[1])
    .filter((n): n is string => Boolean(n));

  const header = (name: string) => {
    const v = root.headers[name];
    return v ? decodeHeaderValue(v) : null;
  };

  return {
    headers: { from: header("from"), to: header("to"), cc: header("cc"), subject: header("subject"), date: header("date") },
    body,
    attachmentNames,
  };
}
