import { NextResponse } from "next/server";
import {
  deriveIdentity,
  lkConfig,
  mintToken,
  newRoomCode,
  normalizeCode,
  roomService,
} from "@/lib/server/livekit";
import type { RoomMeta } from "@/lib/types";

export const runtime = "nodejs";

type Body = { name?: string; clientSecret?: string; room?: string; create?: boolean };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, 40);
  const clientSecret = body.clientSecret ?? "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (clientSecret.length < 16) return NextResponse.json({ error: "Bad client secret" }, { status: 400 });

  try {
    const svc = roomService();
    const identity = deriveIdentity(clientSecret);
    let code: string;

    if (body.create) {
      code = newRoomCode();
      for (let i = 0; i < 5 && (await svc.listRooms([code])).length > 0; i++) code = newRoomCode();
      const meta: RoomMeta = { creator: identity, host: identity };
      await svc.createRoom({
        name: code,
        emptyTimeout: 10 * 60, // keep a fresh room alive 10 min until someone joins
        departureTimeout: 5 * 60, // and 5 min after the last person leaves (refresh-safe)
        maxParticipants: 25,
        metadata: JSON.stringify(meta),
      });
    } else {
      const c = normalizeCode(body.room);
      if (!c) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
      const rooms = await svc.listRooms([c]);
      if (rooms.length === 0) return NextResponse.json({ error: "Room not found or has ended" }, { status: 404 });
      code = c;
    }

    const token = await mintToken(code, identity, name);
    return NextResponse.json({ token, url: lkConfig().url, room: code, identity });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || "Server error" }, { status: 500 });
  }
}
