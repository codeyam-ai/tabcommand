import { MaxAutoClosedTime } from '../../Constants';

// Turns the stored `autoClosed` map (urlKey -> close timestamp) into the url
// keys the Automatically Closed section shows: only closes still inside the
// retention window, most recently closed first, so what was just closed is
// easy to restore.
const sortAutoClosed = (autoClosed, now = Date.now()) => {
  const closed = autoClosed || {};
  const maxTime = closed.maxTime || MaxAutoClosedTime;
  return Object.keys(closed)
    .filter((urlKey) => now - closed[urlKey] < maxTime)
    .sort((a, b) => closed[b] - closed[a]);
};

export default sortAutoClosed;
