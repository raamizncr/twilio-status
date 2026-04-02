/**
 * Vercel serverless entry (runs after `npm run build` produces ../dist/app.js).
 * Do not serve this repo as static files only — use vercel.json outputDirectory + this handler.
 */
import { createApp } from "../dist/app.js";

export default createApp();
