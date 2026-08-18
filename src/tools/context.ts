import { getThread } from "./comments.js";
import { getTicket } from "./tickets.js";
import { parseTicketId } from "../utils.js";

/**
 * One call for everything a human would read on a ticket page: metadata, every
 * message with its real body, internal notes, and an index of attachments the
 * get_attachment tool can then open.
 */
export async function getTicketContext(ticketId: string, options: { includeQuoted?: boolean } = {}) {
  const id = parseTicketId(ticketId);
  const [ticket, thread] = await Promise.all([getTicket(id), getThread(id, options)]);

  const attachments = thread.entries.flatMap((entry) =>
    entry.attachments.map((a) => ({
      ...a,
      threadId: entry.id,
      fromName: entry.fromName,
      createdTime: entry.createdTime,
    }))
  );

  return {
    ticket,
    entries: thread.entries,
    attachments,
    notes: {
      duplicatesCollapsed: thread.duplicatesCollapsed,
      quotedRepliesTrimmed: thread.quotedRepliesTrimmed,
      attachmentHint: attachments.length
        ? "Use get_attachment with ticketId + threadId + attachmentId + fileName to read an attachment."
        : null,
    },
  };
}
