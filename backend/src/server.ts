import express from "express";
import cors from "cors";
import { env } from "@/config/env";
import apiRouter from "@/api/index";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(env.port, () => {
  console.log(`[API] Server running at http://localhost:${env.port}`);
});
