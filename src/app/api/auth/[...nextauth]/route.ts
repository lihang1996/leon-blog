import { handlers } from "@/auth";

/**
 * Auth.js route handler (architecture §11.1). Node runtime (default) because
 * the Credentials `authorize` callback reads the database through Prisma.
 */
export const { GET, POST } = handlers;
