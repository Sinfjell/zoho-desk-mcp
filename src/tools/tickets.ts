import { get } from "../client.js";
import { ZohoValidationError } from "../client.js";
import { htmlToText, parseTicketId } from "../utils.js";

interface ZohoTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  contactId: string;
  departmentId: string;
  assigneeId?: string;
  assignee?: { firstName?: string; lastName?: string };
  createdTime: string;
  modifiedTime: string;
  webUrl: string;
  channel?: string;
  language?: string;
  threadCount?: string;
  commentCount?: string;
  contact?: { firstName?: string; lastName?: string; email?: string; account?: { accountName?: string } };
  department?: { name?: string };
  cf?: Record<string, unknown>;
}

interface ZohoTicketList {
  data: ZohoTicket[];
  count: number;
}

export function formatTicket(t: ZohoTicket) {
  const contactName = [t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(" ") || "Unknown";
  const assigneeName = t.assignee
    ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(" ")
    : null;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    description: htmlToText(t.description ?? ""),
    status: t.status,
    priority: t.priority,
    contactId: t.contactId,
    contactName,
    contactEmail: t.contact?.email ?? null,
    accountName: t.contact?.account?.accountName ?? null,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    channel: t.channel ?? null,
    language: t.language ?? null,
    // Zoho leaves `description` null on email tickets — the opening message is
    // the first thread, so use get_thread / get_ticket_context for the body.
    threadCount: Number(t.threadCount ?? 0),
    commentCount: Number(t.commentCount ?? 0),
    assigneeId: t.assigneeId ?? null,
    assigneeName: assigneeName ?? null,
    createdTime: t.createdTime,
    modifiedTime: t.modifiedTime,
    webUrl: t.webUrl,
  };
}

export async function getTicket(ticketId: string) {
  const id = parseTicketId(ticketId);
  const ticket = await get<ZohoTicket>(`/tickets/${id}`, { include: "contacts,assignee,departments" });
  return formatTicket(ticket);
}

export async function listMyTickets(args: {
  status?: string;
  limit?: number;
  from?: number;
}) {
  const departmentId = process.env.ZOHO_DESK_DEPARTMENT_ID;
  const agentId = process.env.ZOHO_AGENT_ID;

  const result = await get<ZohoTicketList>("/tickets", {
    assignee: agentId,
    departmentId,
    status: args.status ?? "Open",
    from: args.from ?? 1,
    limit: Math.min(args.limit ?? 20, 50),
    include: "contacts,assignee",
  });

  return {
    tickets: result.data.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      contactName: [t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(" ") || "Unknown",
      modifiedTime: t.modifiedTime,
      webUrl: t.webUrl,
    })),
    total: result.count,
  };
}

export async function searchTickets(args: {
  query?: string;
  contactEmail?: string;
  status?: string;
  limit?: number;
  from?: number;
}) {
  if (!args.query && !args.contactEmail) {
    throw new ZohoValidationError("At least one of 'query' or 'contactEmail' must be provided");
  }

  const departmentId = process.env.ZOHO_DESK_DEPARTMENT_ID;

  const result = await get<ZohoTicketList>("/tickets/search", {
    _all: args.query,
    email: args.contactEmail,
    status: args.status,
    departmentId,
    from: args.from ?? 1,
    limit: Math.min(args.limit ?? 20, 50),
  });

  return {
    tickets: result.data.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      contactName: [t.contact?.firstName, t.contact?.lastName].filter(Boolean).join(" ") || "Unknown",
      modifiedTime: t.modifiedTime,
      webUrl: t.webUrl,
    })),
    total: result.count,
  };
}
