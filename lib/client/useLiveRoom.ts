"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  DisconnectReason,
  LocalVideoTrack,
  Participant,
  Room,
  RoomEvent,
  RpcError,
  ScreenSharePresets,
  Track,
  VideoPresets,
  VideoQuality,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import type { RoomMeta } from "@/lib/types";
import type { JoinInfo } from "./storage";
import { blobToDataUrl, captureTrack, dataUrlToBlob } from "./snapshot";

const SNAP_RPC = "acm.snapshot";
const SNAP_TOPIC = "acm.snapshot";

export type Feed = {
  key: string;
  identity: string;
  name: string;
  isLocal: boolean;
  source: Track.Source;
  track: Track;
  publication: TrackPublication;
};

export type Person = {
  identity: string;
  name: string;
  isLocal: boolean;
  camOn: boolean;
  screenOn: boolean;
};

export type RoomStatus = "connecting" | "connected" | "reconnecting" | "ended";

function displayName(p: Participant) {
  return p.name || p.identity;
}

function isLive(pub: TrackPublication | undefined) {
  return !!pub && !!pub.track && !pub.isMuted;
}

export function useLiveRoom(join: JoinInfo | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [endReason, setEndReason] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const pending = useRef(new Map<string, (b: Blob) => void>());

  useEffect(() => {
    if (!join) return;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h1080.resolution },
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
        videoEncoding: VideoPresets.h1080.encoding,
        screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
        degradationPreference: "maintain-resolution",
      },
    });
    const bump = () => setVersion((v) => v + 1);

    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.RoomMetadataChanged,
      RoomEvent.ParticipantNameChanged,
    ] as const;
    events.forEach((e) => r.on(e, bump));

    r.on(RoomEvent.ConnectionStateChanged, (s) => {
      if (s === ConnectionState.Connected) setStatus("connected");
      else if (s === ConnectionState.Reconnecting || s === ConnectionState.SignalReconnecting) setStatus("reconnecting");
      bump();
    });
    r.on(RoomEvent.Disconnected, (reason) => {
      setStatus("ended");
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) setEndReason("You were removed from the room.");
      else if (reason === DisconnectReason.ROOM_DELETED) setEndReason("This room has ended.");
      else if (reason === DisconnectReason.DUPLICATE_IDENTITY) setEndReason("You joined this room from another tab.");
      else if (reason !== DisconnectReason.CLIENT_INITIATED) setEndReason("Connection lost.");
      bump();
    });

    // Someone asked us for a full-resolution still of our camera/screen.
    r.registerRpcMethod(SNAP_RPC, async (data) => {
      const { source, reqId } = JSON.parse(data.payload) as { source: Track.Source; reqId: string };
      const pub = r.localParticipant.getTrackPublication(source);
      const mst = isLive(pub) ? pub!.track!.mediaStreamTrack : undefined;
      if (!mst) throw new RpcError(1, "Not broadcasting");
      const blob = dataUrlToBlob(await captureTrack(mst));
      await r.localParticipant.sendFile(new File([blob], `${reqId}.jpg`, { type: "image/jpeg" }), {
        topic: SNAP_TOPIC,
        mimeType: "image/jpeg",
        destinationIdentities: [data.callerIdentity],
        compress: false,
      });
      return "ok";
    });
    r.registerByteStreamHandler(SNAP_TOPIC, async (reader) => {
      const chunks = await reader.readAll();
      const reqId = reader.info.name.replace(/\.jpg$/, "");
      pending.current.get(reqId)?.(new Blob(chunks as BlobPart[], { type: "image/jpeg" }));
    });

    setRoom(r);
    setStatus("connecting");
    setEndReason(null);
    r.connect(join.url, join.token)
      .then(() => {
        setStatus("connected");
        bump();
      })
      .catch((e: Error) => {
        setStatus("ended");
        setEndReason(e.message || "Could not connect.");
      });

    return () => {
      r.unregisterRpcMethod(SNAP_RPC);
      r.unregisterByteStreamHandler(SNAP_TOPIC);
      r.removeAllListeners();
      r.disconnect();
    };
  }, [join]);

  const derived = useMemo(() => {
    const meta: RoomMeta | null = (() => {
      try {
        return room?.metadata ? (JSON.parse(room.metadata) as RoomMeta) : null;
      } catch {
        return null;
      }
    })();
    const parts: Participant[] = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
    const people: Person[] = [];
    const feeds: Feed[] = [];
    for (const p of parts) {
      if (!p.identity) continue;
      const isLocal = p === room!.localParticipant;
      const cam = p.getTrackPublication(Track.Source.Camera);
      const scr = p.getTrackPublication(Track.Source.ScreenShare);
      people.push({ identity: p.identity, name: displayName(p), isLocal, camOn: isLive(cam), screenOn: isLive(scr) });
      for (const pub of [scr, cam]) {
        if (!isLive(pub)) continue;
        feeds.push({
          key: `${p.identity}:${pub!.source}`,
          identity: p.identity,
          name: displayName(p),
          isLocal,
          source: pub!.source,
          track: pub!.track!,
          publication: pub!,
        });
      }
    }
    return { meta, people, feeds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, version]);

  const me = room?.localParticipant.identity ?? join?.identity ?? "";
  const camOn = isLive(room?.localParticipant.getTrackPublication(Track.Source.Camera));
  const screenOn = isLive(room?.localParticipant.getTrackPublication(Track.Source.ScreenShare));

  const toggleCamera = useCallback(async () => {
    if (!room) return;
    if (camOn) {
      await room.localParticipant.setCameraEnabled(false);
    } else {
      const pub = await room.localParticipant.setCameraEnabled(true, {
        facingMode: facing,
        resolution: VideoPresets.h1080.resolution,
      });
      // Tell the encoder that sharp detail (text) matters more than smooth motion.
      const mst = pub?.track?.mediaStreamTrack;
      if (mst && "contentHint" in mst) mst.contentHint = "text";
    }
    setVersion((v) => v + 1);
  }, [room, camOn, facing]);

  const flipCamera = useCallback(async () => {
    if (!room) return;
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (track instanceof LocalVideoTrack) {
      await track.restartTrack({ facingMode: next, resolution: VideoPresets.h1080.resolution });
      track.mediaStreamTrack.contentHint = "text";
    }
  }, [room, facing]);

  const toggleScreen = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setScreenShareEnabled(!screenOn, {
      audio: false,
      resolution: ScreenSharePresets.h1080fps15.resolution,
      contentHint: "text",
    });
    setVersion((v) => v + 1);
  }, [room, screenOn]);

  /** Best possible still of a feed: ask the broadcaster for a full-res frame, fall back to what we receive. */
  const snapshot = useCallback(
    async (feed: Feed): Promise<string> => {
      if (!room) throw new Error("Not connected");
      if (feed.isLocal) return captureTrack(feed.track.mediaStreamTrack);
      const reqId = Math.random().toString(36).slice(2, 12);
      try {
        const got = new Promise<Blob>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), 12_000);
          pending.current.set(reqId, (b) => {
            clearTimeout(t);
            resolve(b);
          });
        });
        await room.localParticipant.performRpc({
          destinationIdentity: feed.identity,
          method: SNAP_RPC,
          payload: JSON.stringify({ source: feed.source, reqId }),
          responseTimeout: 12_000,
        });
        return await blobToDataUrl(await got);
      } catch {
        (feed.publication as RemoteTrackPublication).setVideoQuality?.(VideoQuality.HIGH);
        return captureTrack(feed.track.mediaStreamTrack);
      } finally {
        pending.current.delete(reqId);
      }
    },
    [room],
  );

  const moderate = useCallback(
    async (action: "setHost" | "kick", target: string) => {
      if (!join) return;
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: join.token, action, target }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Action failed");
    },
    [join],
  );

  const leave = useCallback(() => room?.disconnect(), [room]);

  return {
    room,
    status,
    endReason,
    me,
    meta: derived.meta,
    people: derived.people,
    feeds: derived.feeds,
    camOn,
    screenOn,
    toggleCamera,
    flipCamera,
    toggleScreen,
    snapshot,
    setHost: (t: string) => moderate("setHost", t),
    kick: (t: string) => moderate("kick", t),
    leave,
  };
}
