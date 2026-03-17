import { get, post } from "../client.js";
import { htmlToText } from "../utils.js";

interface ZohoThread {
  id: string;
  type?: string;
  channel?: string;
  direction?: string;
  isPublic?: boolean;
  content?: string;
  from?: { name?: string; email?: string };
  createdTime: string;
}

interface ZohoComment {
  id: string;
  isPublic: boolean;
  content?: string;
  commentedBy?: string;
  commenter?: { name?: string; email?: string };
  createdTime: string;
}

interface ZohoThreadList {
  data: ZohoThread[];
}

interface ZohoCommentList {
  data: ZohoComment[];
}

export async function getThread(ticketId: string) {
  const [threadsRes, commentsRes] = await Promise.all([
    get<ZohoThreadList>(`/tickets/${ticketId}/threads`),
    get<ZohoCommentList>(`/tickets/${ticketId}/comments`),
  ]);

  const threads = (threadsRes.data ?? []).map((t) => ({
    id: t.id,
    type: "emailThread" as const,
    direction: t.direction ?? null,
    isPublic: t.isPublic ?? true,
    content: htmlToText(t.content ?? ""),
    fromName: t.from?.name ?? "Unknown",
    fromEmail: t.from?.email ?? null,
    createdTime: t.createdTime,
  }));

  const comments = (commentsRes.data ?? []).map((c) => ({
    id: c.id,
    type: "comment" as const,
    direction: null,
    isPublic: c.isPublic,
    content: htmlToText(c.content ?? ""),
    fromName: c.commenter?.name ?? c.commentedBy ?? "Unknown",
    fromEmail: c.commenter?.email ?? null,
    createdTime: c.createdTime,
  }));

  const entries = [...threads, ...comments].sort(
    (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
  );

  return { entries };
}

export async function createInternalNote(ticketId: string, content: string) {
  // isPublic is hardcoded false — never sent to customer
  const result = await post<ZohoComment>(`/tickets/${ticketId}/comments`, {
    content,
    isPublic: false,
  });

  return {
    id: result.id,
    content: result.content ?? content,
    createdTime: result.createdTime,
    isPublic: false as const,
  };
}

export async function createDraftReply(ticketId: string, content: string) {
  const result = await post<{ id: string; content?: string; createdTime: string }>(
    `/tickets/${ticketId}/draftReply`,
    { content, channel: "EMAIL" }
  );

  return {
    threadId: result.id,
    content: result.content ?? content,
    createdTime: result.createdTime,
  };
}
