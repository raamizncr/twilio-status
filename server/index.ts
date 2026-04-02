import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = createApp();
const PORT = Number(process.env.PORT) || 3001;

const clientDist = path.join(__dirname, "../client/dist");
const indexHtml = path.join(clientDist, "index.html");
if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(indexHtml);
  });
}

app.listen(PORT, () => {
  console.log(`A2P visibility API http://localhost:${PORT}`);
});
