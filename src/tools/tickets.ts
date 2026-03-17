import { get } from "../client.js";
import { ZohoValidationError } from "../client.js";
import { htmlToText } from "../utils.js";

interface ZohoTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  contactId: string;
  contact?: { firstName?: string; lastName?: string; email?: string };
  departmentId: string;
  assigneeId?: string;
  assignee?: { firstName?: string; lastName?: string };
  createdTime: string;
  modifiedTime: string;
  webUrl: string;
  cf?: Record<string, unknown>;
}

interface ZohoTicketList {
  data: ZohoTicket[];
  count: number;
}

function parseTicketId(input: string): string {
  // Accept numeric ID or full Zoho Desk URL
  const urlMatch = input.match(/\/tickets\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  return input.trim();
}

function formatTicket(t: ZohoTicket) {
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
    departmentId: t.departmentId,
    assigneeId: t.assigneeId ?? null,
    assigneeName: assigneeName ?? null,
    createdTime: t.createdTime,
    modifiedTime: t.modifiedTime,
    webUrl: t.webUrl,
  };
}

export async function getTicket(ticketId: string) {
  const id = parseTicketId(ticketId);
  const ticket = await get<ZohoTicket>(`/tickets/${id}`, { include: "contacts,assignee" });
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
