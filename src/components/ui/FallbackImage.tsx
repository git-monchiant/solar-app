"use client";

import { useState } from "react";
import ImageLightbox, { LightboxImage } from "./ImageLightbox";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackLabel?: string;
  /** Open a fullscreen lightbox on click. Defaults to true. */
  zoomable?: boolean;
  /** Optional gallery this image belongs to — lightbox will expose prev/next. */
  gallery?: LightboxImage[];
  /** Index inside gallery that corresponds to this image. */
  galleryIndex?: number;
  /** Label shown in the lightbox header when no gallery is supplied. */
  lightboxLabel?: string;
}

export default function FallbackImage({
  src, alt, fallbackLabel = "ไม่พบรูป", className = "",
  zoomable = true, gallery, galleryIndex, lightboxLabel,
  onClick: onClickProp,
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(galleryIndex ?? 0);

  if (failed || !src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5l14 14" />
        </svg>
        <span className="text-xs font-medium">{fallbackLabel}</span>
      </div>
    );
  }

  const handleClick: React.MouseEventHandler<HTMLImageElement> = (e) => {
    onClickProp?.(e);
    if (!zoomable || e.defaultPrevented) return;
    e.stopPropagation();
    setIndex(galleryIndex ?? 0);
    setOpen(true);
  };

  const images: LightboxImage[] = gallery && gallery.length > 0
    ? gallery
    : [{ url: String(src), label: lightboxLabel ?? (typeof alt === "string" ? alt : undefined) }];

  return (
    <>
      <img
        {...rest}
        src={src}
        alt={alt}
        className={`${className} ${zoomable ? "cursor-zoom-in" : ""}`}
        onError={() => setFailed(true)}
        onClick={handleClick}
      />
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
