export const CACHE_TAGS = {
  dashboard: "dashboard",
  reservations: "reservations",
  requests: "requests",
  rooms: "rooms",
  customers: "customers",
  mailTemplates: "mail-templates",
  mailLogs: (entityType: string, entityId: string) =>
    `mail-logs:${entityType}:${entityId}`,
  calendar: "calendar",
  reservation: (id: string) => `reservation:${id}`,
  request: (id: string) => `request:${id}`,
  customer: (id: string) => `customer:${id}`,
} as const;
