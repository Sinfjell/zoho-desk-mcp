import { patch } from "../client.js";

const VALID_STATUSES = ["Open", "On Hold", "Closed", "In Progress"] as const;
type TicketStatus = typeof VALID_STATUSES[number];

interface ZohoTicket {
  id: string;
  status: string;
}

export async function updateTicketStatus(ticketId: string, status: string) {
  if (!VALID_STATUSES.includes(status as TicketStatus)) {
    throw new Error(`Invalid status "${status}". Valid values: ${VALID_STATUSES.join(", ")}`);
  }

  const result = await patch<ZohoTicket>(`/tickets/${ticketId}`, { status });
  return {
    id: result.id,
    status: result.status,
  };
}
