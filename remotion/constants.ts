export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;
export const VIDEO_DURATION = 1020;

export const SCENES = {
	opening: { start: 0, duration: 165 },
	chat: { start: 135, duration: 240 },
	orchestration: { start: 345, duration: 225 },
	capabilities: { start: 540, duration: 210 },
	trust: { start: 720, duration: 165 },
	closing: { start: 855, duration: 165 },
} as const;
