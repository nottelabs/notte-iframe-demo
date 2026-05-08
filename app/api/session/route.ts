import { NextResponse } from "next/server";
import { NotteClient } from "notte-sdk";

export const runtime = "nodejs";

const NOTTE_BASE_URL = "https://api.notte.cc";

export async function POST() {
  const apiKey = process.env.NOTTE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NOTTE_API_KEY not set" }, { status: 500 });
  }

  const notte = new NotteClient({ apiKey });
  const session = notte.Session({
    max_duration_minutes: 15,
    viewport_width: 1440,
    viewport_height: 900,
  });
  await session.start();
  await session.execute({ type: "goto", url: "https://notte.cc" });

  const status = await session.status();
  return NextResponse.json({
    sessionId: session.getId(),
    viewerUrl: status.viewer_url,
  });
}

export async function DELETE(req: Request) {
  const apiKey = process.env.NOTTE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NOTTE_API_KEY not set" }, { status: 500 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const res = await fetch(`${NOTTE_BASE_URL}/sessions/${sessionId}/stop`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
