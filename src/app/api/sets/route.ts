import { NextResponse } from "next/server";
import { parseQuizletText } from "@/lib/quizlet";
import { ingestSet, listSets, deleteSet } from "@/lib/sets";
import { trackServer } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const sets = await listSets();
  return NextResponse.json({ sets });
}

export async function POST(req: Request) {
  let body: {
    title?: string;
    text?: string;
    sourceUrl?: string;
    termDelimiter?: string;
    cardDelimiter?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const title = body.title?.trim();
  const text = body.text ?? "";
  if (!title) {
    return NextResponse.json({ error: "A set title is required" }, { status: 400 });
  }

  const cards = parseQuizletText(text, {
    termDelimiter: body.termDelimiter,
    cardDelimiter: body.cardDelimiter,
  });
  if (cards.length === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't find any term/definition pairs. Check the delimiter (Quizlet's default puts a Tab between term and definition).",
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestSet(title, cards, body.sourceUrl?.trim() || undefined);
    void trackServer("study_set_added", { cards: cards.length });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json(
      { error: "Failed to ingest set. Check server logs and API keys." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteSet(id);
  void trackServer("study_set_deleted", { set_id: id });
  return NextResponse.json({ ok: true });
}
