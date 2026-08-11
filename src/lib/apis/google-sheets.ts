import { GoogleAuth } from "google-auth-library";
import type { WebsiteAuditReport } from "@/types";

export async function saveAuditToGoogleSheets(report: WebsiteAuditReport) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_AUDIT_SPREADSHEET_ID;
  if (!spreadsheetId) return false;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const values = [[report.auditedAt, report.companyName, report.url, report.overallScore, report.executiveSummary, report.scores.map(item => `${item.category}: ${item.score}/10`).join(" | "), report.improvements.map((item, index) => `${index + 1}. [${item.priority}] ${item.title}: ${item.recommendation}`).join("\n"), report.professionalReport]];
  const range = encodeURIComponent(process.env.GOOGLE_SHEETS_AUDIT_RANGE ?? "Website Audits!A:H");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" }, body: JSON.stringify({ values }) });
  if (!response.ok) throw new Error(`Google Sheets save failed (${response.status}): ${await response.text()}`);
  return true;
}
