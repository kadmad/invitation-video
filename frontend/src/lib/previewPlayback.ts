export function playPreview(video: HTMLVideoElement | null) {
  if (!video || !video.paused) return;
  video.play().catch(() => {});
}

export function pausePreview(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
}
