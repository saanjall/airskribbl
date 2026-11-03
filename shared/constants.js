// Values the client and server must agree on.

// Logical drawing surface. Stroke points travel as 0..1 fractions of it, so every
// screen size renders the same picture.
export const CANVAS_W = 1280;
export const CANVAS_H = 960;

export const BRUSH_COLORS = [
  '#16122B', '#6B6880', '#E5484D', '#FF8A1F', '#FFD23F', '#2FBF71',
  '#1FD6C1', '#2B5BFF', '#7C4DFF', '#FF4FA3', '#8A5A3B', '#F2B99B',
];
export const ERASER_COLOR = '#FFFFFF';
export const BRUSH_MIN = 2;
export const BRUSH_MAX = 48;
export const ERASER_MAX = 220;
export const SHAPES = ['line', 'rect', 'circle', 'triangle'];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;
export const CHAT_MAX = 100;
export const AVATAR_COUNT = 48;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEFAULT_SETTINGS = { rounds: 3, drawTime: 60 };
export const ROUND_OPTIONS = [2, 3, 4, 5];
export const DRAW_TIME_OPTIONS = [45, 60, 90, 120];
