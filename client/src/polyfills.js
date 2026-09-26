import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.global = window;
  window.process = {
    env: { DEBUG: undefined },
    nextTick: (cb) => setTimeout(cb, 0),
  };
  window.Buffer = Buffer;
}
