import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    text: text().notNull(),
    ipHash: text("ip_hash").notNull(),
    reports: integer().notNull().default(0),
    hidden: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_ip_created_idx").on(t.ipHash, t.createdAt)]
);
