import type {Metadata} from "next";
import "./globals.css";
import {Shell} from "@/components/shell";

export const metadata: Metadata = {
  title: "NEXUS // AI Revenue Operations",
  description:
    "Discover, enrich, contact and convert high-intent prospects from one AI command center.",
};

const fallbackStyles = `
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;background:#0B0F19;color:#dbe4ef;font-family:Inter,system-ui,sans-serif}
  body{background:
    linear-gradient(to right, rgba(6,182,212,.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(6,182,212,.05) 1px, transparent 1px),
    #0B0F19;
    background-size:32px 32px;
  }
  a{color:inherit;text-decoration:none}
  .panel{background:rgba(15,23,42,.72);border:1px solid #1e293b;box-shadow:0 24px 80px rgba(0,0,0,.24);backdrop-filter:blur(12px)}
  .input{width:100%;border:1px solid #263449;background:#0b111e;padding:.8rem 1rem;border-radius:.55rem;color:white;outline:none}
  .input:focus{border-color:#06b6d4;box-shadow:0 0 0 2px rgba(6,182,212,.08)}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border-radius:.5rem;padding:.72rem 1rem;font-family:monospace;font-size:.74rem;font-weight:600;letter-spacing:.04em;transition:.2s}
  .btn-primary{background:#10b981;color:#04130e}
  .btn-primary:hover{background:#34d399}
  .btn-ghost{border:1px solid #29374d;color:#94a3b8;background:#101827}
  .btn-ghost:hover{border-color:#06b6d4;color:#67e8f9}
  .thin-scroll::-webkit-scrollbar{width:5px;height:5px}
  .thin-scroll::-webkit-scrollbar-thumb{background:#334155;border-radius:8px}
  .dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <style>{fallbackStyles}</style>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
