// Faithful port of the reference TabCommand keydown pub/sub
// (../tabcommand/src/lib/utils/KeyDown.js). A tiny global registry over a single
// `document.onkeydown` listener: `add(f)` subscribes, `remove(f)` unsubscribes,
// and `trigger(e)` fans an event (real or synthetic, see `event`) out to every
// subscriber. Search uses it for Cmd/Ctrl+F focus + Escape close, and
// SearchResults for arrow/enter navigation. API kept identical so that behavior
// reproduces exactly.
const KeyDown = {
  functions: [],
  add: (f) => {
    KeyDown.functions.push(f);

    document.onkeydown = (e) => {
      e = e || window.event;
      KeyDown.trigger(e);
    };
  },
  remove: (f) => {
    const functionIndex = KeyDown.functions.indexOf(f);
    if (functionIndex === -1) return;
    KeyDown.functions.splice(functionIndex, 1);
  },
  trigger: (e) => {
    for (const f of KeyDown.functions) {
      f(e);
    }
  }
};

export default KeyDown;
