import "server-only";

import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as schema from "@/db/schema";

const registrationGateSecret = process.env.REGISTRATION_GATE_SECRET;
const trustedOrigins = [
  ...(process.env.TRUSTED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  "https://*.trycloudflare.com",
];

if (!registrationGateSecret) {
  throw new Error("REGISTRATION_GATE_SECRET is required.");
}

export const auth = betterAuth({
  appName: "圆个圈 Along",
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      realName: {
        type: "string",
        required: true,
        input: true,
      },
      nickname: {
        type: "string",
        required: false,
        input: true,
      },
      role: {
        type: ["admin", "member"],
        required: true,
        defaultValue: "member",
        input: false,
      },
    },
  },
  telemetry: {
    enabled: false,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-up/email") {
        return;
      }

      const gate = context.headers?.get("x-registration-gate");
      if (gate !== registrationGateSecret) {
        throw new APIError("FORBIDDEN", {
          message: "注册必须通过有效邀请。",
        });
      }
    }),
  },
});

export type AuthSession = typeof auth.$Infer.Session;
