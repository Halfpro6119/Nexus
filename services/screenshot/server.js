import express from "express";
import { chromium } from "playwright-core";
import dns from "node:dns/promises";
import net from "node:net";

const app = express();
app.use(express.json({ limit: "1mb" }));

function isPrivate(address) {
  if (net.isIP(address) === 4) {
    return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
  }
  return address === "::1" || /^fc|^fd|^fe80/i.test(address);
}

async function capture(browser, url, viewport, mobile, fullPage) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    return (await page.screenshot({ type: "jpeg", quality: 72, fullPage })).toString("base64");
  } finally {
    await context.close();
  }
}

app.get("/health", (_, response) => response.json({ ok: true }));

app.post("/", async (request, response) => {
  let browser;
  try {
    const target = new URL(String(request.body.url));
    if (!['http:', 'https:'].includes(target.protocol)) return response.status(400).json({ error: "Invalid protocol" });
    const addresses = await dns.lookup(target.hostname, { all: true });
    if (addresses.some((entry) => isPrivate(entry.address))) return response.status(400).json({ error: "Private network targets are blocked" });

    const formats = Array.isArray(request.body.formats) ? request.body.formats : [];
    const fullPage = Boolean(request.body.fullPage);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    if (formats.includes("desktop") || formats.includes("mobile")) {
      const [desktop, mobile] = await Promise.all([
        capture(browser, target.href, { width: 1440, height: 1000 }, false, fullPage),
        capture(browser, target.href, { width: 390, height: 844 }, true, fullPage),
      ]);
      return response.json({ desktopBase64: desktop, mobileBase64: mobile });
    }
    const imageBase64 = await capture(browser, target.href, { width: Math.min(Number(request.body.width) || 1440, 1920), height: Math.min(Number(request.body.height) || 1200, 1600) }, false, fullPage);
    return response.json({ imageBase64 });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Screenshot failed" });
  } finally {
    await browser?.close();
  }
});

app.listen(process.env.PORT || 8080, "0.0.0.0");
