export type SwipeDirection = 'next' | 'previous';

const minDistance = 40;

export function onSwipe(target: EventTarget, listener: (direction: SwipeDirection) => void): () => void {
  let start: { x: number; y: number } | undefined;
  const begin = (event: Event) => {
    const { touches } = event as TouchEvent;
    const touch = touches[0];
    start = touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  };
  const end = (event: Event) => {
    const touch = (event as TouchEvent).changedTouches[0];
    const from = start;
    start = undefined;
    if (!from || !touch) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) < minDistance || Math.abs(dx) <= Math.abs(dy)) return;
    listener(dx < 0 ? 'next' : 'previous');
  };
  const cancel = () => {
    start = undefined;
  };
  target.addEventListener('touchstart', begin, { passive: true });
  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', cancel);
  return () => {
    target.removeEventListener('touchstart', begin);
    target.removeEventListener('touchend', end);
    target.removeEventListener('touchcancel', cancel);
  };
}
