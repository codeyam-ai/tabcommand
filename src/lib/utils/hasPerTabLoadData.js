// Answers the one question five different surfaces ask of the `loadDataSource`
// storage marker: can we attribute load to INDIVIDUAL tabs? Only Chrome's Dev
// channel exposes the processes API, so only the 'processes' source can; on
// stable Chrome the source is 'system'/'none' (or unset before the service
// worker has written it) and per-tab claims would be dishonest.
//
// Shared by LoadMeter, Triage, Settings, LoadPerTabNote and App's sidebar-footer
// gauge wrapper so all five hide and show on exactly the same condition — the
// gauge's wrapper included, or its divider hairline would linger with nothing
// inside it.
export function hasPerTabLoadData(source) {
  return source === 'processes';
}

export default hasPerTabLoadData;
