import { Texture, Ticker, VideoSource } from 'pixi.js';

export interface VideoBackdrop {
  texture: Texture;
  dispose(): void;
}

/** Most frames per second copied from the video to the texture (the backdrops are 24 and 30 fps). */
const MAX_FPS = 30;
/** How often a paused backdrop is told to play again, in ms. */
const RESUME_EVERY_MS = 1000;

/**
 * A looping, silent video as a texture. It is fetched whole first and played from memory: a video element
 * asks for parts of a file, which the service worker's cached copy can't answer, so this is what keeps
 * it working offline. Rejects if the file is missing or the browser can't play it.
 *
 * The texture is refreshed from our own ticker, not Pixi's auto-update. Pixi waits for the browser's
 * per-frame video callback, and for a video that isn't in the page that callback can stop for good when
 * the window changes mode (F11 fullscreen froze the swirl). The same tick also restarts the video if the
 * browser paused it.
 */
export async function loadVideoBackdrop(url: string): Promise<VideoBackdrop> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.src = objectUrl;
  const release = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  };
  try {
    await video.play();
    const source = new VideoSource({ resource: video });
    await source.load();
    source.autoUpdate = false; // refreshed by `tick` below instead
    const texture = new Texture({ source });

    let lastFrame = -1;
    let lastResume = 0;
    const tick = () => {
      if (video.paused) {
        const now = performance.now();
        if (now - lastResume >= RESUME_EVERY_MS) {
          lastResume = now;
          video.play().catch(() => {
            /* tried again on a later tick */
          });
        }
        return;
      }
      // a new frame index whenever the video has moved on; a loop back to the start counts too
      const frame = Math.floor(video.currentTime * MAX_FPS);
      if (frame !== lastFrame && source.isValid) {
        lastFrame = frame;
        source.update();
      }
    };
    Ticker.shared.add(tick);

    return {
      texture,
      dispose() {
        Ticker.shared.remove(tick);
        texture.destroy(true);
        release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
