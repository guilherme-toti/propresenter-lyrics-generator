"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ImageOff, Play, VideoOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MediaType } from "@/lib/propresenter/backgrounds/media";

/** A video's first frame; WebKit leaves a preload="metadata" video blank unless the URL asks to
 * start a little past zero. */
const FIRST_FRAME_FRAGMENT = "#t=0.1";

/** "fill" stretches the file to the frame, the way the church's macros show it; "contain" shows
 * the file as it is, for the tray. */
export type PreviewFit = "fill" | "contain";

const FIT_CLASSES: Record<PreviewFit, string> = { fill: "object-fill", contain: "object-contain" };

/** With no picture to show, the overlay goes under the message rather than on top of it. */
function PreviewMessage({ icon, children, overlay }: { icon: ReactNode; children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-cream-200/80">
      {icon}
      <span className="text-sm leading-tight">{children}</span>
      {overlay && <div className="mt-1">{overlay}</div>}
    </div>
  );
}

/** Marks a preview as a video, since a still frame alone looks like an image. `compact` drops the
 * word, for a thumbnail too small to carry it; the file's name says what it is there. */
export function VideoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inline-flex items-center gap-1 rounded-full bg-ink/70 text-xs text-cream-50 backdrop-blur-sm",
        compact ? "bottom-1 left-1 p-1" : "bottom-1.5 left-1.5 px-1.5 py-0.5",
      )}
    >
      <Play size={10} className="fill-current" aria-hidden />
      {!compact && "Vídeo"}
    </span>
  );
}

function CentredOverlay({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-1">{children}</div>;
}

interface VideoPreviewProps {
  src: string;
  fileName: string;
  fit: PreviewFit;
  overlay?: ReactNode;
}

/** Keyed by `src` from the caller, so a replaced file gets a fresh attempt at playing. */
function VideoPreview({ src, fileName, fit, overlay }: VideoPreviewProps) {
  // HEVC files play in ProPresenter but not in every webview (Windows needs a paid codec), so a
  // preview that can't decode says so instead of sitting there black.
  const [failed, setFailed] = useState(false);

  return (
    <>
      {failed ? (
        <PreviewMessage icon={<VideoOff size={22} aria-hidden />} overlay={overlay}>
          Sem prévia
        </PreviewMessage>
      ) : (
        <>
          <video
            src={`${src}${FIRST_FRAME_FRAGMENT}`}
            aria-label={`Prévia de ${fileName}`}
            muted
            loop
            playsInline
            preload="metadata"
            className={cn("absolute inset-0 h-full w-full", FIT_CLASSES[fit])}
            onError={() => setFailed(true)}
            // Hovering plays it, so a video can be told apart from a still without opening it.
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0.1;
            }}
          />
          {overlay && <CentredOverlay>{overlay}</CentredOverlay>}
        </>
      )}
      <VideoBadge />
    </>
  );
}

interface MediaPreviewProps {
  /** Null when the file is missing. */
  src: string | null;
  mediaType: MediaType;
  fileName: string;
  fit: PreviewFit;
  /** How wide the preview gets, for next/image. */
  sizes: string;
  /** Shown over the middle of the picture, or under the message when there's no picture. */
  overlay?: ReactNode;
}

/** An image or video filling its (positioned) parent. */
export function MediaPreview({ src, mediaType, fileName, fit, sizes, overlay }: MediaPreviewProps) {
  if (!src) {
    return (
      <PreviewMessage icon={<ImageOff size={22} aria-hidden />} overlay={overlay}>
        Arquivo não encontrado
      </PreviewMessage>
    );
  }
  if (mediaType === "image") {
    return (
      <>
        <Image
          src={src}
          alt={`Prévia de ${fileName}`}
          fill
          unoptimized
          draggable={false}
          sizes={sizes}
          className={FIT_CLASSES[fit]}
        />
        {overlay && <CentredOverlay>{overlay}</CentredOverlay>}
      </>
    );
  }
  return <VideoPreview key={src} src={src} fileName={fileName} fit={fit} overlay={overlay} />;
}
