import { NextResponse } from "next/server";
import { NotteClient } from "notte-sdk";

export const runtime = "nodejs";

const NOTTE_BASE_URL = "https://api.notte.cc";
const INITIAL_GOTO_URL = "https://example.com";

type TimingEntry = {
  name: string;
  ms: number;
};

function createSessionTimer(method: string) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const timings: TimingEntry[] = [];
  let lastMark = startedAt;

  const checkpoint = (name: string) => {
    const now = performance.now();
    timings.push({ name, ms: now - lastMark });
    lastMark = now;
  };

  const log = (event: "complete" | "error", extra: Record<string, unknown> = {}) => {
    const totalMs = performance.now() - startedAt;
    console.info(
      JSON.stringify({
        event: "api.session.timing",
        requestId,
        method,
        result: event,
        totalMs: Math.round(totalMs),
        timings: timings.map((timing) => ({
          name: timing.name,
          ms: Math.round(timing.ms),
        })),
        ...extra,
      }),
    );
  };

  return { checkpoint, log, requestId };
}

async function timed<T>(
  timer: ReturnType<typeof createSessionTimer>,
  name: string,
  fn: () => Promise<T>,
) {
  const result = await fn();
  timer.checkpoint(name);
  return result;
}

function runBackgroundGoto(
  session: ReturnType<NotteClient["Session"]>,
  sessionId: string,
  parentRequestId: string,
) {
  const startedAt = performance.now();

  void session
    .execute({ type: "goto", url: INITIAL_GOTO_URL })
    .then((result) => {
      console.info(
        JSON.stringify({
          event: "api.session.background_goto",
          parentRequestId,
          sessionId,
          result: "complete",
          url: INITIAL_GOTO_URL,
          success: result.success,
          totalMs: Math.round(performance.now() - startedAt),
        }),
      );
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          event: "api.session.background_goto",
          parentRequestId,
          sessionId,
          result: "error",
          url: INITIAL_GOTO_URL,
          error: error instanceof Error ? error.message : String(error),
          totalMs: Math.round(performance.now() - startedAt),
        }),
      );
    });
}

export async function POST() {
  const timer = createSessionTimer("POST");

  const apiKey = process.env.NOTTE_API_KEY;
  timer.checkpoint("read_env");
  if (!apiKey) {
    timer.log("error", { error: "NOTTE_API_KEY not set", status: 500 });
    return NextResponse.json({ error: "NOTTE_API_KEY not set" }, { status: 500 });
  }

  try {
    const notte = new NotteClient({ apiKey });
    timer.checkpoint("create_client");

    const session = notte.Session({
      max_duration_minutes: 15,
      viewport_width: 1440,
      viewport_height: 900,
    });
    timer.checkpoint("create_session");

    await timed(timer, "session_start", () => session.start());
    const sessionId = session.getId();
    timer.checkpoint("get_session_id_after_start");
    if (!sessionId) {
      throw new Error("Session started without an id");
    }

    runBackgroundGoto(session, sessionId, timer.requestId);
    timer.checkpoint("start_background_goto");

    const startResponse = session.getResponse();
    const viewerUrl =
      startResponse?.viewer_url ??
      (await timed(timer, "session_status_for_viewer_url", () => session.status())).viewer_url;
    if (startResponse?.viewer_url) {
      timer.checkpoint("read_viewer_url_from_start_response");
    }

    const response = NextResponse.json({
      sessionId,
      viewerUrl,
    });
    timer.checkpoint("build_response");
    timer.log("complete", {
      sessionId,
      backgroundGotoUrl: INITIAL_GOTO_URL,
      hasViewerUrl: Boolean(viewerUrl),
      status: 200,
    });

    return response;
  } catch (error) {
    timer.log("error", {
      error: error instanceof Error ? error.message : String(error),
      status: 500,
    });
    throw error;
  }
}

export async function DELETE(req: Request) {
  const timer = createSessionTimer("DELETE");

  const apiKey = process.env.NOTTE_API_KEY;
  timer.checkpoint("read_env");
  if (!apiKey) {
    timer.log("error", { error: "NOTTE_API_KEY not set", status: 500 });
    return NextResponse.json({ error: "NOTTE_API_KEY not set" }, { status: 500 });
  }

  const { sessionId } = await timed(timer, "parse_request_json", () => req.json());
  if (!sessionId) {
    timer.log("error", { error: "sessionId required", status: 400 });
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const res = await timed(timer, "stop_session_fetch", () =>
      fetch(`${NOTTE_BASE_URL}/sessions/${sessionId}/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    if (!res.ok) {
      const errorText = await timed(timer, "read_error_response", () => res.text());
      timer.log("error", { sessionId, upstreamStatus: res.status, status: res.status });
      return NextResponse.json({ error: errorText }, { status: res.status });
    }

    const response = NextResponse.json({ ok: true });
    timer.checkpoint("build_response");
    timer.log("complete", { sessionId, upstreamStatus: res.status, status: 200 });

    return response;
  } catch (error) {
    timer.log("error", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      status: 500,
    });
    throw error;
  }
}
