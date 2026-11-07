import type { Config, Context } from "@netlify/functions";
import { and, asc, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { chatMessages } from "../../db/schema.js";

const MAX_NAME = 20;
const MAX_TEXT = 300;
const HIDE_AFTER_REPORTS = 3;

const BLOCK = [
  /[\w.+-]+@[\w-]+\.[\w.]+/i,
  /(\+?\d[\s-]?){9,}/,
  /\b(instagram|snapchat|tiktok|whatsapp|discord)\b/i,
];
const BAD = ["fuck", "shit", "cunt", "bitch", "nigg", "faggot", "retard"];

function problem(text: string): string | null {
  if (BLOCK.some((r) => r.test(text)))
    return "Messages can't include emails, phone numbers or social media for safety reasons.";
  if (BAD.some((w) => text.toLowerCase().includes(w))) return "Please keep the chat respectful.";
  return null;
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode("medatlas-chat:" + ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const publicFields = {
  id: chatMessages.id,
  name: chatMessages.name,
  text: chatMessages.text,
  time: chatMessages.createdAt,
};

const err = (message: string, status = 400) => Response.json({ error: message }, { status });

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const after = Number(url.searchParams.get("after") || 0);
    const rows =
      after > 0
        ? await db
            .select(publicFields)
            .from(chatMessages)
            .where(and(eq(chatMessages.hidden, false), gt(chatMessages.id, after)))
            .orderBy(asc(chatMessages.id))
            .limit(100)
        : (
            await db
              .select(publicFields)
              .from(chatMessages)
              .where(eq(chatMessages.hidden, false))
              .orderBy(desc(chatMessages.id))
              .limit(100)
          ).reverse();
    return Response.json({ messages: rows }, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return err("Invalid request.");
    }
    const ipHash = await hashIp(context.ip || "unknown");

    // Report a message
    if (body?.action === "report") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return err("Invalid message.");
      await db
        .update(chatMessages)
        .set({
          reports: sql`${chatMessages.reports} + 1`,
          hidden: sql`${chatMessages.reports} + 1 >= ${HIDE_AFTER_REPORTS}`,
        })
        .where(eq(chatMessages.id, id));
      return Response.json({ ok: true });
    }

    const name = String(body?.name ?? "").trim().slice(0, MAX_NAME);
    const text = String(body?.text ?? "").trim().slice(0, MAX_TEXT);
    if (!name || !text) return err("Please enter a nickname and a message.");
    const p = problem(name + " " + text);
    if (p) return err(p);

    // Rate limit: max 1 message per 3s and 10 per minute per visitor
    const now = Date.now();
    const recent = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.ipHash, ipHash), gte(chatMessages.createdAt, new Date(now - 60_000))))
      .orderBy(desc(chatMessages.createdAt));
    if (recent.length >= 10) return err("You're sending messages too quickly. Please wait a minute.", 429);
    if (recent[0] && now - new Date(recent[0].createdAt).getTime() < 3000)
      return err("Please wait a few seconds between messages.", 429);

    const [msg] = await db.insert(chatMessages).values({ name, text, ipHash }).returning(publicFields);
    return Response.json({ message: msg }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/chat",
};
