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
// Ordered for clean, non-"thinking-out-loud" output and availability. The
// nemotron reasoning model is last because it can leak its scratchpad.
const MODELS = [
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
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

const SYSTEM_PROMPT = `You ARE Aman Dalal — speaking in the first person on your own portfolio website. You are also a capable general-purpose AI assistant. You typically talk with recruiters and hiring managers.

How to behave:
- ALWAYS speak as Aman himself, in the first person ("I", "my", "me"). Never refer to "Aman" in the third person and never say you are "Aman's assistant" — you ARE Aman.
- For questions about your career, experience, skills, education, or availability: answer ONLY from the profile below. Never invent employers, job titles, dates, or metrics. If a personal detail (salary, private life) isn't in the profile, say you'd rather discuss that directly and point them to amandalal0708@gmail.com or LinkedIn.
- You can ALSO help with general questions on any topic (definitions, explanations, advice, current events, small talk) — answer those helpfully and accurately, still as yourself. When live web-search results are provided, use them for current facts.
- If asked whether you're available for work: yes — I'm open to Operations Engineer, Project Manager, and Process Improvement roles across Germany, with a work permit valid until January 2028.
- Keep answers concise and professional; recruiters may be reading.

--- MY PROFILE (Aman Dalal) ---
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

    // Free live web search (Wikipedia + DuckDuckGo, no API key). If the latest
    // user message looks like it needs current/general facts, fetch context and
    // inject it so the model isn't limited to its training cutoff.
    const lastUser = [...incoming].reverse().find((m) => m.role === "user");
    if (lastUser && lastUser.content) {
      const ctx = await webSearch(String(lastUser.content));
      if (ctx) {
        convo.splice(1, 0, {
          role: "system",
          content:
            "Live web search results for the user's question (use these for any " +
            "current or factual info; they are more up-to-date than your training " +
            "data). If they don't cover it, answer from your own knowledge:\n\n" + ctx,
        });
      }
    }

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

// Wikipedia expects a descriptive User-Agent; DDG is lenient. Free, no keys.
const SEARCH_UA =
  "AmanPortfolioTwin/1.0 (https://amndlal.github.io/portfolio-website; amandalal0708@gmail.com)";

// Skip searching for pure chit-chat / questions that are only about Aman —
// those are answered from the profile and don't need the web.
function shouldSearch(q) {
  const s = q.trim();
  if (s.length < 4) return false;
  if (/^(hi|hey|hello|thanks|thank you|ok|okay|bye|cool|nice)\b/i.test(s)) return false;
  // If it's clearly a first-person question about Aman, the profile covers it.
  if (/\b(you|your|aman|his|he)\b/i.test(s) && !/\b(what is|who is|when|latest|current|news|today|2025|2026|price|weather|how many|capital of|explain)\b/i.test(s))
    return false;
  return true;
}

async function webSearch(query) {
  if (!shouldSearch(query)) return "";
  const parts = [];
  try {
    const [wiki, ddg] = await Promise.allSettled([
      searchWikipedia(query),
      searchDuckDuckGo(query),
    ]);
    if (wiki.status === "fulfilled" && wiki.value) parts.push(wiki.value);
    if (ddg.status === "fulfilled" && ddg.value) parts.push(ddg.value);
  } catch {
    /* search is best-effort; ignore failures */
  }
  return parts.join("\n\n").slice(0, 3000); // keep the injected context bounded
}

async function searchWikipedia(query) {
  const api = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", list: "search", srsearch: query,
    format: "json", srlimit: "3", origin: "*",
  });
  const r = await fetch(api, { headers: { "User-Agent": SEARCH_UA } });
  if (!r.ok) return "";
  const d = await r.json();
  const hits = d?.query?.search || [];
  if (!hits.length) return "";
  // Pull a clean summary of the top hit for real detail.
  let summary = "";
  try {
    const title = encodeURIComponent(hits[0].title.replace(/ /g, "_"));
    const sr = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { "User-Agent": SEARCH_UA } }
    );
    if (sr.ok) { const sd = await sr.json(); summary = sd?.extract || ""; }
  } catch { /* summary optional */ }
  const lines = hits.map(
    (h) => `- ${h.title}: ${h.snippet.replace(/<[^>]+>/g, "")}`
  );
  return `Wikipedia:\n${summary ? summary + "\n" : ""}${lines.join("\n")}`;
}

async function searchDuckDuckGo(query) {
  const api = "https://api.duckduckgo.com/?" + new URLSearchParams({
    q: query, format: "json", no_html: "1", skip_disambig: "1",
  });
  const r = await fetch(api, { headers: { "User-Agent": SEARCH_UA } });
  if (!r.ok) return "";
  const d = await r.json();
  const bits = [];
  if (d.AbstractText) bits.push(d.AbstractText);
  if (d.Answer) bits.push(String(d.Answer));
  (d.RelatedTopics || []).slice(0, 3).forEach((t) => {
    if (t && t.Text) bits.push(t.Text);
  });
  return bits.length ? `DuckDuckGo:\n${bits.join("\n")}` : "";
}
