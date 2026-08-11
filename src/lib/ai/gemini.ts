import { GoogleGenAI } from "@google/genai";

function getVertexClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  if (!project) throw new Error("Vertex AI is not configured. Add GOOGLE_CLOUD_PROJECT to .env.local.");
  return new GoogleGenAI({ vertexai: true, project, location });
}

function vertexError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  if (/not configured|GOOGLE_CLOUD_PROJECT/i.test(detail)) return error instanceof Error ? error : new Error(detail);
  if (/Unable to read the credential file|Could not load the default credentials|default credentials|UNAUTHENTICATED|401/i.test(detail)) return new Error("Vertex AI could not authenticate. GOOGLE_APPLICATION_CREDENTIALS must point to an existing service-account JSON file, then Nexus must be restarted.");
  if (/403|PERMISSION_DENIED/i.test(detail)) return new Error("Vertex AI access was denied. Enable the Vertex AI API and grant the service account the Vertex AI User role.");
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(detail)) return new Error("Vertex AI is temporarily at capacity after several automatic retries. Wait a minute and retry; Nexus will preserve the lead in the queue.");
  if (/404|NOT_FOUND/i.test(detail)) return new Error("The configured Vertex AI model is unavailable in this project or location.");
  return new Error("Vertex AI could not complete the request. Check the server log for Google's response.");
}

function isCapacityError(error: unknown) { const detail = error instanceof Error ? error.message : String(error); return /429|RESOURCE_EXHAUSTED|Resource exhausted/i.test(detail); }
function delay(milliseconds: number) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

async function withCapacityRetry<T>(operation: () => Promise<T>) {
  const waits = [0, 2_000, 5_000];
  let lastError: unknown;
  for (const wait of waits) {
    if (wait) await delay(wait + Math.floor(Math.random() * 750));
    try { return await operation(); }
    catch (error) { lastError = error; if (!isCapacityError(error)) throw error; }
  }
  throw lastError;
}

export async function generateText(prompt: string, fallback: string) {
  try {
    const response = await getVertexClient().models.generateContent({ model: process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash", contents: prompt });
    return response.text ?? fallback;
  } catch (error) { console.warn("Vertex AI text fallback", error); return fallback; }
}

export async function generateSearchAgentJson(prompt: string): Promise<string> {
  try {
    const response = await withCapacityRetry(() =>
      getVertexClient().models.generateContent({
        model: process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 2200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    );
    if (!response.text) throw new Error("Vertex AI returned an empty Search Agent response");
    return response.text;
  } catch (error) {
    console.warn("Vertex AI Search Agent failure", error);
    throw vertexError(error);
  }
}

export async function analyzeLeadWithGrounding(prompt: string, screenshots: Array<{ data: string; mimeType: string }>, fallback: string) {
  try {
    const contents = [{ role: "user", parts: [{ text: prompt }, ...screenshots.map(image => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))] }];
    const client = getVertexClient();
    const primaryModel = process.env.GEMINI_LEAD_MODEL ?? "gemini-2.5-flash-lite";
    let response;
    try { response = await withCapacityRetry(() => client.models.generateContent({ model: primaryModel, contents, config: { tools: [{ googleSearch: {} }], temperature: 0, maxOutputTokens: 3500, thinkingConfig: { thinkingBudget: 0 } } })); }
    catch (error) { if (!isCapacityError(error)) throw error; const fallbackModel = primaryModel === "gemini-2.5-flash-lite" ? "gemini-2.5-flash" : "gemini-2.5-flash-lite"; response = await withCapacityRetry(() => client.models.generateContent({ model: fallbackModel, contents, config: { tools: [{ googleSearch: {} }], temperature: 0, maxOutputTokens: 3500, thinkingConfig: { thinkingBudget: 0 } } })); }
    return response.text ?? fallback;
  } catch (error) { console.warn("Vertex AI enrichment failure", error); throw vertexError(error); }
}

export async function analyzeWebsiteWithEvidence(prompt: string, screenshots: Array<{ data: string; mimeType: string }>) {
  try {
    const parts = [{ text: prompt }, ...screenshots.map(image => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))];
    const client = getVertexClient();
    const primaryModel = process.env.GEMINI_RESEARCH_MODEL ?? "gemini-2.5-flash";
    let response;
    try { response = await withCapacityRetry(() => client.models.generateContent({ model: primaryModel, contents: [{ role: "user", parts }], config: { tools: [{ googleSearch: {} }, { urlContext: {} }], temperature: 0 } })); }
    catch (error) { if (!isCapacityError(error) || primaryModel === "gemini-2.5-flash-lite") throw error; response = await withCapacityRetry(() => client.models.generateContent({ model: "gemini-2.5-flash-lite", contents: [{ role: "user", parts }], config: { tools: [{ googleSearch: {} }, { urlContext: {} }], temperature: 0 } })); }
    if (!response.text) throw new Error("Vertex AI returned an empty audit");
    return response.text;
  } catch (error) { console.warn("Vertex AI website critic failure", error); throw vertexError(error); }
}

export async function generateWithOptionalImage(prompt: string, imageDataUrl: string | undefined, fallback: string) {
  try {
    const match = imageDataUrl?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const contents = match ? [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }] : prompt;
    const response = await getVertexClient().models.generateContent({ model: process.env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro", contents });
    return response.text ?? fallback;
  } catch (error) { console.warn("Vertex AI builder fallback", error); return fallback; }
}
