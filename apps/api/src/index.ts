import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";
import { createAuth } from "./lib/auth.js";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

loadDotEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const env = loadEnv();
const auth = createAuth(env);
const app = createApp(auth, env);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Vedaa API listening on http://localhost:${info.port}`);
  },
);
