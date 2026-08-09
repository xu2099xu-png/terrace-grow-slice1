import { afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';

type TimeoutHandle = ReturnType<typeof setTimeout>;

const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
const activeTimeouts = new Set<TimeoutHandle>();

globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
  let id: TimeoutHandle;
  const wrappedHandler = (...handlerArgs: any[]) => {
    activeTimeouts.delete(id);
    if (typeof handler === 'function') {
      return handler(...handlerArgs);
    }
    return Function(handler)();
  };
  id = nativeSetTimeout(wrappedHandler, timeout, ...args);
  activeTimeouts.add(id);
  return id;
}) as typeof setTimeout;

globalThis.clearTimeout = ((id?: TimeoutHandle) => {
  if (id !== undefined) {
    activeTimeouts.delete(id);
  }
  return nativeClearTimeout(id);
}) as typeof clearTimeout;

enableAutoUnmount(afterEach);

afterEach(() => {
  for (const id of activeTimeouts) {
    nativeClearTimeout(id);
  }
  activeTimeouts.clear();
  document.body.innerHTML = '';
});
