import { apiErrorSchema, mutationSchema, workspaceSchema, type Command } from "@season/types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: string[] = []) { super(message); }
}

export function createApiClient(baseUrl = "", transport: typeof fetch = fetch) {
  async function raw(path: string, method: string, body?: unknown) {
    const response = await transport(`${baseUrl}${path}`, { method, credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      throw new ApiError(parsed.success ? parsed.data.error : "Unable to complete the request.", response.status, parsed.success ? parsed.data.details : []);
    }
    return payload;
  }
  async function request(method: string, body?: unknown) {
    return workspaceSchema.parse(await raw("/api/v1/workspace", method, body));
  }
  return {
    getWorkspace: () => request("GET"),
    execute: (revision: number, command: Command) => request("POST", mutationSchema.parse({ revision, command })),
    sendRegistrationEmail: (tournamentId: string, registrationId: string, subject: string, body: string) =>
      raw("/api/v1/workspace/registration-email", "POST", { tournamentId, registrationId, subject, body }) as Promise<{ ok: true }>,
    startStripeConnect: () => raw("/api/v1/workspace/stripe/connect", "POST") as Promise<{ url: string }>,
    syncStripeStatus: async () => workspaceSchema.parse(await raw("/api/v1/workspace/stripe/status", "POST")),
    refundRegistration: async (tournamentId: string, registrationId: string, amountCents: number) =>
      workspaceSchema.parse(await raw("/api/v1/workspace/stripe/refund", "POST", { tournamentId, registrationId, amountCents })),
    sendInvoice: async (tournamentId: string, registrationId: string) =>
      workspaceSchema.parse(await raw("/api/v1/workspace/stripe/invoice", "POST", { tournamentId, registrationId })),
  };
}