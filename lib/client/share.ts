import { dataUrlToBlob } from "./snapshot";

/** Name for a screenshot file, e.g. mirror-ab12cd-14-05-33.jpg */
export function shotFileName(room: string, at: number) {
  const t = new Date(at).toTimeString().slice(0, 8).replace(/:/g, "-");
  return `mirror-${room}-${t}.jpg`;
}

function toFile(dataUrl: string, name: string) {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], name, { type: blob.type });
}

/** Can this browser hand an image file to the system share sheet (WhatsApp, Telegram, Files…)? */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], "x.jpg", { type: "image/jpeg" });
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/** Opens the share sheet. Resolves false if the user closed it. Must run inside a tap handler. */
export async function shareImage(dataUrl: string, name: string): Promise<boolean> {
  try {
    await navigator.share({ files: [toFile(dataUrl, name)] });
    return true;
  } catch (e) {
    if ((e as Error).name === "AbortError") return false;
    throw e;
  }
}

/** Saves the image to Downloads (or the phone's files). */
export function downloadImage(dataUrl: string, name: string) {
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canCopyImage(): boolean {
  return typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
}

async function toPng(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/png"),
  );
}

/** Puts the image on the clipboard so it can be pasted into a chat. Browsers only accept PNG here. */
export async function copyImage(dataUrl: string) {
  // Safari wants the ClipboardItem created synchronously in the tap, with a promise for the data.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(dataUrl) })]);
}

/** Google's AI Mode page (google.com/ai redirects here). */
export const GOOGLE_AI_URL = "https://www.google.com/aimode";

/** Phones: hand the image to the share sheet (pick the Google app, which opens it in Lens / AI Mode). */
function preferShareSheet() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && canShareFiles();
}

export type Handoff = "shared" | "cancelled" | "copied" | "copied-no-tab" | "unavailable";

/**
 * Manual hand-off to Google, no automation: phones get the share sheet; desktops get the photo
 * on the clipboard plus a Google AI Mode tab (reused between asks) to paste it into.
 * Call straight from a tap/keypress: browsers only allow sharing, copying and new tabs right after one.
 */
export async function handOffToGoogle(dataUrl: string, name: string): Promise<Handoff> {
  if (preferShareSheet()) return (await shareImage(dataUrl, name)) ? "shared" : "cancelled";
  if (!canCopyImage()) return "unavailable";
  const copying = copyImage(dataUrl); // starts the clipboard write before the new tab takes focus
  const tab = window.open(GOOGLE_AI_URL, "mirror-google");
  await copying;
  return tab ? "copied" : "copied-no-tab";
}
