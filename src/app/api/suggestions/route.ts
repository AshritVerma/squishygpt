import { NextResponse } from "next/server";
import { anthropicClient, SUGGESTIONS_MODEL } from "@/lib/anthropic";
import { sampleTerms } from "@/lib/sets";

export const runtime = "nodejs";
export const maxDuration = 30;

const FALLBACK = [
  "Differentials for a painful red eye",
  "Signs of acute angle-closure glaucoma",
  "How do I tell CRAO from CRVO?",
  "Management of a corneal ulcer",
];

export async function POST(req: Request) {
  let recent: string[] = [];
  try {
    const body = await req.json();
    recent = Array.isArray(body?.recentQuestions)
      ? body.recentQuestions.filter((s: unknown) => typeof s === "string").slice(0, 15)
      : [];
  } catch {
    /* no body is fine */
  }

  let terms: { term: string; set_title: string }[] = [];
  try {
    terms = await sampleTerms(40);
  } catch {
    /* db issue -> fall through to fallback */
  }

  // No cards yet: generic starters.
  if (terms.length === 0) {
    return NextResponse.json({ suggestions: FALLBACK, source: "fallback" });
  }

  const termList = terms.map((t) => `- ${t.term} (${t.set_title})`).join("\n");
  const recentList =
    recent.length > 0 ? recent.map((r) => `- ${r}`).join("\n") : "(none yet)";

  const prompt = `Serena is an optometry student/clinician reviewing her own flashcard sets in a chat app. Suggest prompts she might tap next.

Topics that appear in her study sets:
${termList}

Her recent questions:
${recentList}

Produce exactly 4 short suggested questions. Rules:
- Ground every suggestion in the topics from her sets above.
- If she has recent questions, prioritize related/adjacent topics and go one step deeper, but do NOT restate her recent questions.
- Keep each under 60 characters, natural and clinically useful, varied from each other.
- No numbering, no quotes around individual items.
Return ONLY a JSON array of exactly 4 strings.`;

  try {
    const resp = await anthropicClient().messages.create({
      model: SUGGESTIONS_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const parsed = JSON.parse(text.slice(start, end + 1));
    const suggestions = (Array.isArray(parsed) ? parsed : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 4);
    if (suggestions.length === 0) throw new Error("empty suggestions");
    return NextResponse.json({ suggestions, source: "ai" });
  } catch (err) {
    console.error("Suggestions generation failed:", err);
    // Graceful fallback: build simple prompts straight from her terms.
    const fromTerms = terms.slice(0, 4).map((t) => `Tell me about ${t.term}`);
    return NextResponse.json({
      suggestions: fromTerms.length > 0 ? fromTerms : FALLBACK,
      source: "terms",
    });
  }
}
