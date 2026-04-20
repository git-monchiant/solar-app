"use client";

import { useState } from "react";
import ImageLightbox, { LightboxImage } from "./ImageLightbox";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** Optional gallery this image belongs to. Clicking opens the lightbox with
   * prev/next navigation through the full set. If omitted, the lightbox shows
   * just this single image. */
  gallery?: LightboxImage[];
  /** Index inside gallery that corresponds to this image. Required when gallery is passed. */
  galleryIndex?: number;
  /** Label shown in the lightbox header (only when not part of a gallery). */
  label?: string;
  /** Any additional <img> attributes (loading, draggable, etc.). */
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
};

// Drop-in replacement for <img> that adds click-to-zoom via ImageLightbox.
// Renders a button wrapping the <img> so the whole surface is tappable.
export default function ZoomableImg({ src, alt, className, gallery, galleryIndex, label, imgProps }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(galleryIndex ?? 0);

  const images: LightboxImage[] = gallery && gallery.length > 0
    ? gallery
    : [{ url: src, label }];
  const startIndex = gallery && gallery.length > 0 ? (galleryIndex ?? 0) : 0;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIndex(startIndex); setOpen(true); }}
        className="p-0 border-0 bg-transparent cursor-zoom-in inline-block"
        style={{ minHeight: 0 }}
        aria-label={alt || "ดูภาพขยาย"}
      >
        <img src={src} alt={alt || ""} className={className} draggable={false} {...imgProps} />
      </button>
      {open && (
        <ImageLightbox
          images={images}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
