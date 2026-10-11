// Standalone Node server: serves the API and the built frontend. (On Vercel, api/index.ts is used instead.)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(dist));
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () =>
  console.log(`Stock tracker on http://localhost:${port} (data source: ${process.env.DATA_SOURCE === "demo" ? "demo" : "yahoo"})`),
);
