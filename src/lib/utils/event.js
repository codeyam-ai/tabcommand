// Faithful port of the reference TabCommand synthetic-event helper
// (../tabcommand/src/lib/utils/event.js). Builds a minimal event-shaped object
// with no-op `stopPropagation`/`preventDefault` so code can feed a synthetic key
// into `KeyDown.trigger` (e.g. SearchResults triggering an Escape to close the
// overlay after a click). API kept identical to the reference.
const event = (attributes) => {
  return {
    stopPropagation: () => {},
    preventDefault: () => {},
    ...attributes
  }
}

export default event;
