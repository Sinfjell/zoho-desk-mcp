import { getRaw } from "../client.js";
import { ZohoValidationError } from "../client.js";
import { parseEml } from "../eml.js";
import { htmlToText, parseTicketId } from "../utils.js";

// Zoho serves every attachment as text/html regardless of its real type, so the
// filename extension is the only reliable signal for what we can decode.
const TEXT_EXTENSIONS = new Set(["txt", "csv", "json", "xml", "md", "log", "html", "htm", "eml", "ics", "yml", "yaml"]);
const MAX_TEXT_CHARS = 100_000;

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function getAttachment(args: {
  ticketId: string;
  threadId: string;
  attachmentId: string;
  fileName?: string;
}) {
  const ticket = parseTicketId(args.ticketId);
  if (!args.threadId || !args.attachmentId) {
    throw new ZohoValidationError("Both 'threadId' and 'attachmentId' are required — get them from get_thread.");
  }

  const ext = extensionOf(args.fileName ?? "");
  if (args.fileName && !TEXT_EXTENSIONS.has(ext)) {
    return {
      fileName: args.fileName,
      decoded: false as const,
      reason: `Binary attachment (.${ext}) — not readable as text. Open it in Zoho Desk instead.`,
    };
  }

  const { text, contentType } = await getRaw(
    `/tickets/${ticket}/threads/${args.threadId}/attachments/${args.attachmentId}/content`
  );

  return { fileName: args.fileName ?? null, decoded: true as const, contentType, ...renderBody(text, ext) };
}

function renderBody(text: string, ext: string) {
  if (ext === "eml") {
    const mail = parseEml(text);
    return {
      format: "email" as const,
      headers: mail.headers,
      nestedAttachments: mail.attachmentNames,
      content: truncate(mail.body),
    };
  }

  if (ext === "html" || ext === "htm") {
    return { format: "html" as const, content: truncate(htmlToText(text)) };
  }

  return { format: "text" as const, content: truncate(text) };
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n[truncated — ${text.length - MAX_TEXT_CHARS} more characters]`;
}
