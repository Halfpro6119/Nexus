export interface WebsiteScreenshots { desktop: string; mobile: string; mimeType: "image/jpeg"; diagnostics?: string[] }

function configuredEndpoint() {
  const endpoint = process.env.SCREENSHOT_ENDPOINT;
  if (endpoint && !/your-cloud-run|example|placeholder/i.test(endpoint)) return endpoint;
  if (process.env.VERCEL === "1" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/screenshot`;
  return null;
}

function requiresHostedBrowser(): boolean {
  return process.env.VERCEL === "1";
}

export async function captureWebsiteScreenshots(url: string): Promise<WebsiteScreenshots> {
  const endpoint = configuredEndpoint();
  if (endpoint) {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, formats: ["desktop", "mobile"], fullPage: true }) });
    if (!response.ok) throw new Error(`Screenshot service failed (${response.status})`);
    const data = await response.json() as { desktopBase64?: string; mobileBase64?: string; imageBase64?: string };
    const desktop = data.desktopBase64 ?? data.imageBase64;
    if (!desktop) throw new Error("Screenshot service returned no image");
    return { desktop, mobile: data.mobileBase64 ?? desktop, mimeType: "image/jpeg" };
  }
  if (requiresHostedBrowser()) {
    throw new Error("SCREENSHOT_ENDPOINT is required on Vercel. Deploy the included screenshot service to Cloud Run and set its HTTPS URL.");
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(url, { waitUntil: "networkidle", timeout: 35_000 });
    const desktop = (await desktopPage.screenshot({ type: "jpeg", quality: 72, fullPage: true })) as Buffer;
    await desktopContext.close();
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url, { waitUntil: "networkidle", timeout: 35_000 });
    const mobile = (await mobilePage.screenshot({ type: "jpeg", quality: 72, fullPage: true })) as Buffer;
    await mobileContext.close();
    return { desktop: desktop.toString("base64"), mobile: mobile.toString("base64"), mimeType: "image/jpeg" };
  } finally { await browser.close(); }
}

export async function captureLeanWebsiteScreenshots(url: string): Promise<WebsiteScreenshots> {
  if (configuredEndpoint()) return captureWebsiteScreenshots(url);
  if (requiresHostedBrowser()) {
    throw new Error("SCREENSHOT_ENDPOINT is required on Vercel. Deploy the included screenshot service to Cloud Run and set its HTTPS URL.");
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const capture = async (viewport: { width: number; height: number }, mobile: boolean) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      try {
        const page = await context.newPage();
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForTimeout(1_200);
          const image = ((await page.screenshot({ type: "jpeg", quality: 48, fullPage: false })) as Buffer).toString("base64");
          const status = response?.status();
          const title = await page.title().catch(() => "");
          const textLength = await page.locator("body").innerText({ timeout: 3_000 }).then(text => text.trim().length).catch(() => 0);
          const warnings: string[] = [];
          if (!response) warnings.push(`${mobile ? "Mobile" : "Desktop"} navigation returned no HTTP response.`);
          if (status && status >= 400) warnings.push(`${mobile ? "Mobile" : "Desktop"} page returned HTTP ${status}.`);
          if (textLength < 80) warnings.push(`${mobile ? "Mobile" : "Desktop"} page loaded with almost no readable content (${textLength} characters).`);
          if (/not found|error|unavailable|coming soon|parked domain/i.test(title)) warnings.push(`${mobile ? "Mobile" : "Desktop"} page title indicates a problem: “${title}”.`);
          return { image, warnings };
        } catch (error) {
          return { image: "", warnings: [`${mobile ? "Mobile" : "Desktop"} page failed to load: ${error instanceof Error ? error.message.split("\n")[0] : "unknown browser error"}`] };
        }
      } finally { await context.close(); }
    };
    const [desktop, mobile] = await Promise.all([capture({ width: 1280, height: 800 }, false), capture({ width: 390, height: 844 }, true)]);
    return { desktop: desktop.image, mobile: mobile.image, mimeType: "image/jpeg", diagnostics: [...desktop.warnings, ...mobile.warnings] };
  } finally { await browser.close(); }
}

export async function captureScreenshot(url: string) {
  try { return (await captureWebsiteScreenshots(url)).desktop; }
  catch { return null; }
}
