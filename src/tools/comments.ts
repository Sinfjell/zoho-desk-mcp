import { get, getAll, post } from "../client.js";
import { contentFingerprint, htmlToText, mapWithConcurrency, parseTicketId, toCleanText } from "../utils.js";

const DETAIL_CONCURRENCY = 5;

interface ZohoAttachment {
  id: string;
  name?: string;
  size?: string;
}

interface ZohoThreadSummary {
  id: string;
  channel?: string;
  direction?: string;
  visibility?: string;
  isPublic?: boolean;
  hasAttach?: boolean;
  isDescriptionThread?: boolean;
  author?: { name?: string; email?: string; type?: string };
  createdTime: string;
}

interface ZohoThreadDetail extends ZohoThreadSummary {
  content?: string;
  to?: string;
  cc?: string;
  attachments?: ZohoAttachment[];
  isContentTruncated?: boolean;
  fullContentURL?: string | null;
}

interface ZohoComment {
  id: string;
  isPublic: boolean;
  content?: string;
  commenter?: { name?: string; email?: string };
  commentedTime?: string;
  createdTime?: string;
  attachments?: ZohoAttachment[];
}

export interface ThreadEntry {
  id: string;
  type: "emailThread" | "comment";
  direction: string | null;
  isPublic: boolean;
  fromName: string;
  fromEmail: string | null;
  to?: string | null;
  cc?: string | null;
  content: string;
  quotedTrimmed: boolean;
  attachments: { id: string; name: string; size: string | null }[];
  createdTime: string;
  duplicateIds?: string[];
}

function mapAttachments(attachments?: ZohoAttachment[]) {
  return (attachments ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? "unnamed",
    size: a.size ?? null,
  }));
}

function toEntry(detail: ZohoThreadDetail, includeQuoted: boolean): ThreadEntry {
  const html = detail.content ?? "";
  const cleaned = includeQuoted
    ? { text: htmlToText(html), trimmed: false }
    : toCleanText(html);

  return {
    id: detail.id,
    type: "emailThread",
    direction: detail.direction ?? null,
    isPublic: detail.visibility ? detail.visibility === "public" : detail.isPublic ?? true,
    fromName: detail.author?.name ?? "Unknown",
    fromEmail: detail.author?.email ?? null,
    to: detail.to ?? null,
    cc: detail.cc || null,
    content: cleaned.text,
    quotedTrimmed: cleaned.trimmed,
    attachments: mapAttachments(detail.attachments),
    createdTime: detail.createdTime,
  };
}

function commentToEntry(c: ZohoComment): ThreadEntry {
  return {
    id: c.id,
    type: "comment",
    direction: null,
    isPublic: c.isPublic,
    fromName: c.commenter?.name ?? "Unknown",
    fromEmail: c.commenter?.email ?? null,
    content: htmlToText(c.content ?? ""),
    quotedTrimmed: false,
    attachments: mapAttachments(c.attachments),
    // Zoho returns `commentedTime` here, not `createdTime`.
    createdTime: c.commentedTime ?? c.createdTime ?? "",
  };
}

/**
 * Zoho creates one thread per recipient address, so a mail sent to two support
 * aliases lands twice. Same author + same timestamp + same opening text is the
 * same email; keep one and record the sibling IDs.
 */
function dedupeThreads(entries: ThreadEntry[]): ThreadEntry[] {
  const byKey = new Map<string, ThreadEntry>();

  for (const entry of entries) {
    const key = [entry.fromEmail ?? entry.fromName, entry.createdTime, entry.direction, contentFingerprint(entry.content)].join("|");
    const existing = byKey.get(key);
    if (existing) {
      existing.duplicateIds = [...(existing.duplicateIds ?? []), entry.id];
    } else {
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()];
}

export async function getThread(ticketId: string, options: { includeQuoted?: boolean } = {}) {
  const id = parseTicketId(ticketId);

  const [summaries, comments] = await Promise.all([
    getAll<ZohoThreadSummary>(`/tickets/${id}/threads`),
    getAll<ZohoComment>(`/tickets/${id}/comments`),
  ]);

  // The list endpoint carries no body — only the per-thread detail endpoint does.
  const details = await mapWithConcurrency(summaries, DETAIL_CONCURRENCY, (t) =>
    get<ZohoThreadDetail>(`/tickets/${id}/threads/${t.id}`)
  );

  const threads = dedupeThreads(details.map((d) => toEntry(d, options.includeQuoted ?? false)));
  const entries = [...threads, ...comments.map(commentToEntry)].sort(
    (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
  );

  return {
    ticketId: id,
    entries,
    duplicatesCollapsed: details.length - threads.length,
    quotedRepliesTrimmed: !options.includeQuoted,
  };
}

export async function createInternalNote(ticketId: string, content: string) {
  // isPublic is hardcoded false — never sent to customer
  const result = await post<ZohoComment>(`/tickets/${parseTicketId(ticketId)}/comments`, {
    content,
    isPublic: false,
  });

  return {
    id: result.id,
    content: result.content ?? content,
    createdTime: result.commentedTime ?? result.createdTime,
    isPublic: false as const,
  };
}

export async function createDraftReply(ticketId: string, content: string) {
  const result = await post<{ id: string; content?: string; createdTime: string }>(
    `/tickets/${parseTicketId(ticketId)}/draftReply`,
    { content, channel: "EMAIL" }
  );

  return {
    threadId: result.id,
    content: result.content ?? content,
    createdTime: result.createdTime,
  };
}
