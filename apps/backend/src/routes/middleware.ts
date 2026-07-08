/**
 * Middleware de autenticação: valida o app session token (Bearer) e injeta o
 * `userId` no contexto. Todas as rotas de dados exigem sessão válida.
 */

import type { Context, Next } from "hono";
import type { Env } from "../types";
import { verifySession } from "../lib/session";

export interface AuthVars {
  userId: string;
}

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AuthVars }>,
  next: Next,
) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "não autenticado" }, 401);

  const userId = await verifySession(token, c.env.SESSION_JWT_SECRET);
  if (!userId) return c.json({ error: "sessão inválida ou expirada" }, 401);

  c.set("userId", userId);
  await next();
}
