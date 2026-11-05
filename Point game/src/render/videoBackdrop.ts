import { Texture, VideoSource } from 'pixi.js';

export interface VideoBackdrop {
  texture: Texture;
  dispose(): void;
}

/**
 * A looping, silent video as a texture. It is fetched whole first and played from memory: a video element
 * asks for parts of a file, which the service worker's cached copy can't answer, so this is what keeps
 * it working offline. Rejects if the file is missing or the browser can't play it.
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
    const texture = new Texture({ source });
    return {
      texture,
      dispose() {
        texture.destroy(true);
        release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
