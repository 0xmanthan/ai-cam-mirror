import { NextResponse } from "next/server";
import { parseMeta, roomService, verifyParticipant } from "@/lib/server/livekit";
import type { RoomMeta } from "@/lib/types";

export const runtime = "nodejs";

type Body = { token?: string; action?: "setHost" | "kick"; target?: string };

/** Moderation actions. The caller proves who they are with their own LiveKit token. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const { token, action, target } = body;
  if (!token || !action || !target) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  try {
    const { identity, room } = await verifyParticipant(token);
    const svc = roomService();
    const [info] = await svc.listRooms([room]);
    const meta = parseMeta(info?.metadata);
    if (!info || !meta) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    const participants = await svc.listParticipants(room);
    if (!participants.some((p) => p.identity === target)) {
      return NextResponse.json({ error: "That person is not in the room" }, { status: 404 });
    }

    if (action === "setHost") {
      if (identity !== meta.creator) {
        return NextResponse.json({ error: "Only the room creator can choose the host" }, { status: 403 });
      }
      const next: RoomMeta = { ...meta, host: target };
      await svc.updateRoomMetadata(room, JSON.stringify(next));
      return NextResponse.json({ ok: true, meta: next });
    }

    if (action === "kick") {
      if (identity !== meta.creator && identity !== meta.host) {
        return NextResponse.json({ error: "Only the host or creator can remove people" }, { status: 403 });
      }
      if (target === meta.creator) return NextResponse.json({ error: "The creator can't be removed" }, { status: 403 });
      if (target === identity) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
      await svc.removeParticipant(room, target);
      if (target === meta.host) {
        await svc.updateRoomMetadata(room, JSON.stringify({ ...meta, host: meta.creator }));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || "Server error" }, { status: 500 });
  }
}
