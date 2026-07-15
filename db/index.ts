import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const globalForDatabase = globalThis as unknown as {
  friendNestPool?: Pool;
};

export const pool =
  globalForDatabase.friendNestPool ??
  new Pool({
    connectionString: databaseUrl,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.friendNestPool = pool;
}

export const db = drizzle(pool, { schema });
