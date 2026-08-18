import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getTicket, listMyTickets, searchTickets } from "./tools/tickets.js";
import { getContact } from "./tools/contacts.js";
import { getThread, createInternalNote, createDraftReply } from "./tools/comments.js";
import { getTicketContext } from "./tools/context.js";
import { getAttachment } from "./tools/attachments.js";
import { updateTicketStatus } from "./tools/status.js";

const server = new Server(
  { name: "zoho-desk", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_ticket_context",
      description:
        "Everything about a ticket in one call: metadata, every email with its real body, internal notes, and an attachment index. Prefer this over get_ticket + get_thread when you need to understand a ticket. Accepts a ticket ID or any Zoho Desk URL.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID or full Zoho Desk URL" },
          includeQuoted: {
            type: "boolean",
            description: "Include the quoted reply chain in each message (default false — quoted history is stripped since it repeats earlier messages verbatim)",
          },
        },
        required: ["ticketId"],
      },
    },
    {
      name: "get_ticket",
      description: "Fetch ticket metadata (status, contact, assignee) by ID or URL. Note: `description` is null on email tickets — use get_ticket_context for the actual conversation.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID or full Zoho Desk URL" },
        },
        required: ["ticketId"],
      },
    },
    {
      name: "list_my_tickets",
      description: "List tickets assigned to me in the configured department.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (default: Open)" },
          limit: { type: "number", description: "Max results (default: 20, max: 50)" },
          from: { type: "number", description: "Pagination offset (default: 1)" },
        },
      },
    },
    {
      name: "search_tickets",
      description: "Search tickets by keyword or contact email. At least one of query or contactEmail must be provided.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword search across all ticket fields" },
          contactEmail: { type: "string", description: "Filter by exact contact email address" },
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Max results (default: 20)" },
          from: { type: "number", description: "Pagination offset (default: 1)" },
        },
      },
    },
    {
      name: "get_contact",
      description: "Fetch contact details (name, email, phone, company) by contact ID.",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Zoho contact ID" },
        },
        required: ["contactId"],
      },
    },
    {
      name: "get_thread",
      description: "Fetch the full comment and email thread for a ticket in chronological order, with full message bodies and attachment metadata.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID or full Zoho Desk URL" },
          includeQuoted: {
            type: "boolean",
            description: "Include the quoted reply chain in each message (default false)",
          },
        },
        required: ["ticketId"],
      },
    },
    {
      name: "get_attachment",
      description:
        "Read the contents of a ticket attachment. Text formats (.eml, .txt, .csv, .html, .json, .xml, .md, .log, .ics) are decoded; .eml files are parsed into headers plus body. Binary files are reported as unreadable. Get the IDs from get_ticket_context or get_thread.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID or full Zoho Desk URL" },
          threadId: { type: "string", description: "ID of the thread entry the attachment belongs to" },
          attachmentId: { type: "string", description: "Attachment ID" },
          fileName: { type: "string", description: "Attachment filename — determines how the content is decoded" },
        },
        required: ["ticketId", "threadId", "attachmentId"],
      },
    },
    {
      name: "create_internal_note",
      description:
        "Create an internal agent note on a ticket. This is NOT sent to the customer and is only visible to agents.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID" },
          content: { type: "string", description: "Note content (plain text or HTML)" },
        },
        required: ["ticketId", "content"],
      },
    },
    {
      name: "create_draft_reply",
      description:
        "Create a draft email reply on a ticket. This will NOT be sent until you manually send it from the Zoho Desk UI.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID" },
          content: { type: "string", description: "Reply body (plain text or HTML)" },
        },
        required: ["ticketId", "content"],
      },
    },
    {
      name: "update_ticket_status",
      description: "Change the status of a ticket.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID" },
          status: {
            type: "string",
            enum: ["Open", "On Hold", "Closed", "In Progress"],
            description: "New status",
          },
        },
        required: ["ticketId", "status"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    let result: unknown;

    switch (name) {
      case "get_ticket":
        result = await getTicket(a.ticketId as string);
        break;
      case "list_my_tickets":
        result = await listMyTickets({
          status: a.status as string | undefined,
          limit: a.limit as number | undefined,
          from: a.from as number | undefined,
        });
        break;
      case "search_tickets":
        result = await searchTickets({
          query: a.query as string | undefined,
          contactEmail: a.contactEmail as string | undefined,
          status: a.status as string | undefined,
          limit: a.limit as number | undefined,
          from: a.from as number | undefined,
        });
        break;
      case "get_contact":
        result = await getContact(a.contactId as string);
        break;
      case "get_ticket_context":
        result = await getTicketContext(a.ticketId as string, {
          includeQuoted: a.includeQuoted as boolean | undefined,
        });
        break;
      case "get_thread":
        result = await getThread(a.ticketId as string, {
          includeQuoted: a.includeQuoted as boolean | undefined,
        });
        break;
      case "get_attachment":
        result = await getAttachment({
          ticketId: a.ticketId as string,
          threadId: a.threadId as string,
          attachmentId: a.attachmentId as string,
          fileName: a.fileName as string | undefined,
        });
        break;
      case "create_internal_note":
        result = await createInternalNote(a.ticketId as string, a.content as string);
        break;
      case "create_draft_reply":
        result = await createDraftReply(a.ticketId as string, a.content as string);
        break;
      case "update_ticket_status":
        result = await updateTicketStatus(a.ticketId as string, a.status as string);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
