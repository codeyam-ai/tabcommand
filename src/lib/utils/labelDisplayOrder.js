// The one place that knows how a group card paints its members.
//
// A group card renders open tabs first, under the "Open" header, then the
// saved-only rows — so the order on screen is NOT the order in the stored
// `urlKeys` array. Anything that reasons about a row's POSITION (the drop
// index @hello-pangea/dnd reports, for instance) is working in this displayed
// space and has to translate back before touching storage.
//
// The rule lived inline in LabelCollection, which is how the drag reducer came
// to splice at a displayed index into the stored array. Extracted here so the
// renderer and the reducer read the same ordering from one definition and can
// never drift apart again.

// Order `urlKeys` the way a group card paints them: open tabs first, saved-only
// after, preserving the relative order inside each section (the sort is stable,
// and must stay so — it is what keeps a reorder inside one section meaningful).
export const labelDisplayOrder = (urlKeys, activeTabs) => {
  const keys = urlKeys || [];
  const tabs = activeTabs || [];

  return [...keys].sort(
    (a, b) =>
      (tabs.filter((tab) => tab.urlKey === a).length ? -1 : 1) -
      (tabs.filter((tab) => tab.urlKey === b).length ? -1 : 1)
  );
};

export default labelDisplayOrder;
