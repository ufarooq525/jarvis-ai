import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getJarvisRuntime } from "../../../src/runtime.js";

const port = Number(process.env.JARVIS_API_PORT ?? 3020);
getJarvisRuntime(); // warm mock engine

const app = createApp();

console.log(`JARVIS API (Phase A) listening on http://127.0.0.1:${port}`);
console.log(`Adapter: mock (exclusive) — Goal Engine never calls Umer AI OS`);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
