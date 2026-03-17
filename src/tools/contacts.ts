import { get } from "../client.js";

interface ZohoContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobile?: string;
  description?: string;
  createdTime: string;
  account?: { companyName?: string; id?: string };
}

export async function getContact(contactId: string) {
  const contact = await get<ZohoContact>(`/contacts/${contactId}`, { include: "accounts" });
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone ?? null,
    mobile: contact.mobile ?? null,
    accountName: contact.account?.companyName ?? null,
    accountId: contact.account?.id ?? null,
    description: contact.description ?? null,
    createdTime: contact.createdTime,
  };
}
