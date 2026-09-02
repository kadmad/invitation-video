// Native template previews are decorative and should never compete with one
// another for the browser's media/decoder budget. The editor's Remotion Player
// is intentionally not part of this coordinator.
let activePreview: HTMLVideoElement | null = null;

export function playPreview(video: HTMLVideoElement | null) {
  if (!video) return;

  if (activePreview && activePreview !== video) {
    activePreview.pause();
  }
  activePreview = video;

  video.play().catch(() => {
    // Autoplay can still be rejected by browser policy. Keep the failure
    // local; the next hover/visibility/canplay event can try again.
    if (activePreview === video) activePreview = null;
  });
}

export function pausePreview(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  if (activePreview === video) activePreview = null;
}
