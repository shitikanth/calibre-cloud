export async function swipe(target: Element, from: number, to: number) {
  const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 300, screenX: x, screenY: 300, pageX: x, pageY: 300 });
  const fire = (type: string, x: number) => {
    const touches = type === 'touchend' ? [] : [touch(x)];
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: [touch(x)] }));
  };
  fire('touchstart', from);
  const step = (to - from) / 10;
  for (let x = from + step; Math.abs(x - from) <= Math.abs(to - from); x += step) {
    fire('touchmove', x);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  fire('touchend', to);
}
