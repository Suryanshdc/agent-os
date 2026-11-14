import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@aios/shared";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

/** RBAC guard. Use after `authenticate`. */
export function requireRole(...allowed: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowed.includes(req.user.role)) {
      return reply.code(403).send({ error: "forbidden", required: allowed });
    }
  };
}

// DEV ONLY. Replace with Postgres users + argon2 password hashes.
export const DEV_USERS: Record<string, { password: string; role: Role }> = {
  alice: { password: "admin123", role: "admin" },
  bob: { password: "dev123", role: "developer" },
  carol: { password: "view123", role: "viewer" },
};
