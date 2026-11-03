const FLUSH_MS = 40;

/**
 * Throttles drawing traffic: point ops are merged and sent at 25 Hz, while
 * begin/end/undo/clear flush first so the receiver sees everything in order.
 */
export function createOpBatcher(send) {
  let pending = null;
  let timer = null;

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (pending) send(pending);
    pending = null;
  };

  return {
    push(op) {
      if (op.op !== 'points') {
        flush();
        send(op);
        return;
      }
      if (pending && pending.id === op.id) pending.pts.push(...op.pts);
      else {
        flush();
        pending = { op: 'points', id: op.id, pts: [...op.pts] };
      }
      timer ??= setTimeout(flush, FLUSH_MS);
    },
    flush,
  };
}
