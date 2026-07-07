/**
 * Digital-twin proxy — Cloudflare Worker.
 *
 * The portfolio (static GitHub Pages) can't safely hold the OpenRouter key, so
 * the browser calls THIS worker instead. The key lives here as a secret
 * (set with `wrangler secret put OPENROUTER_API_KEY`) and never reaches the page.
 *
 * Deploy: see README.md in this folder.
 */

// Free OpenRouter models, tried in order; falls through on rate-limit/error.
const MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
];

const CAREER_FACTS = `
# Aman Dalal — Career Profile

## Snapshot
- Operations Engineer Intern (RME — Reliability & Maintenance Engineering) at Amazon, Mönchengladbach, Germany (May 2026 – present).
- MSc Industrial Engineering & International Management, Hochschule Fresenius, Cologne (2025 – 2027).
- Based in the Cologne/Bonn region, Germany. Work permit valid until January 2028.
- Open to Operations Engineer, Project Manager, and Process Improvement roles across Germany.

## Contact
- Email: amandalal0708@gmail.com
- LinkedIn: linkedin.com/in/amndlal
- GitHub: github.com/amndlal
- Portfolio: https://amndlal.github.io/portfolio-website

## Experience
### Operations Engineer Intern (RME) — Amazon, Mönchengladbach (May 2026 – present)
- Supporting reliability and maintenance engineering at a major fulfilment centre.
- Applying lean principles and data analytics to large-scale logistics processes.
### Project Planner — Godrej & Boyce Manufacturing, Delhi, India (Mar 2023 – Jan 2025)
- Managed 3 end-to-end projects, coordinating teams of 10+ with 95% on-time delivery.
- Built 5+ Power BI dashboards consolidating procurement and project KPIs.
- Reduced supply chain reporting lead time by ~30% through SAP automation.
- Applied DMAIC in quality audits, reducing recurring defects by 25%.
### Industrial Trainee — FJM Cylinders (JBM Group), Haryana (Jan 2022 – Jun 2022)
- ~15% defect reduction via root-cause analysis; 10+ machines at ~98% uptime.
### Industrial Training — Maruti Suzuki India Limited, Gurugram (Jun 2021 – Nov 2021)
- Precision manufacturing; Capability Index analysis of CNC machines.

## Education
- MSc Industrial Engineering & International Management — Hochschule Fresenius, Cologne (2025–2027). Smart Production, Industry 4.0, Digitalisation & AI, Quality Management. Research: 3D Simulation with AR.
- BTech Mechanical Engineering — Maharshi Dayanand University (2017–2021).

## Certifications
- Lean Six Sigma Green Belt — Six Sigma Management Academy, Cologne (July 2025), certified by MBB Philip Bauer. DMAIC, SPC, Root-Cause Analysis, Waste Elimination.
- Active Buddy Programme Mentor for international students at Hochschule Fresenius.

## Skills
- Lean Six Sigma (Green Belt), DMAIC, SPC, Root Cause Analysis, Continuous Improvement, Quality Management.
- Power BI, Data Analytics, KPI tracking, Advanced Excel.
- SAP ERP, MS Project, AutoCAD, SOLIDWORKS.
- Project Management, Agile/Scrum, stakeholder coordination.
- Industry 4.0, Smart Production, 3D simulation, AR visualisation.

## Languages
- English (C1), German (B1), Hindi (native).
`;

const SYSTEM_PROMPT = `You are the digital twin of Aman Dalal — an AI that answers questions about Aman's career, skills, and experience on his behalf. You are embedded on his portfolio website and typically speak with recruiters and hiring managers.

Rules:
- Answer as Aman, in the first person ("I worked on...", "My experience is...").
- Base every answer ONLY on the profile below. If asked something not covered (salary, personal life, opinions on specific companies, anything not in the profile), say you don't have that detail here and suggest they email Aman at amandalal0708@gmail.com or connect on LinkedIn.
- Never invent facts, employers, dates, or metrics. Do not exaggerate.
- Be warm, concise, and professional. Keep answers to a few sentences unless asked for detail.
- If asked whether Aman is available: yes, he's open to Operations Engineer, Project Manager, and Process Improvement roles across Germany, with a work permit valid until January 2028.

--- AMAN'S PROFILE ---
${CAREER_FACTS}
--- END PROFILE ---`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const convo = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of incoming.slice(-20)) {
      if ((m.role === "user" || m.role === "assistant") && m.content) {
        convo.push({ role: m.role, content: String(m.content) });
      }
    }
    if (convo.length < 2) return json({ error: "no messages provided" }, 400);

    let lastErr = "";
    for (const model of MODELS) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, max_tokens: 800, messages: convo }),
        });
        if (!r.ok) { lastErr = `${model}: ${r.status}`; continue; }
        const data = await r.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (reply) return json({ reply });
      } catch (e) {
        lastErr = `${model}: ${e}`;
      }
    }
    return json({ error: `All free models unavailable. ${lastErr}` }, 502);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
