export function dashboardRoom(eventId) {
  return `event:${eventId}:dashboard`;
}

export function scanRoom(eventId) {
  return `event:${eventId}:scan`;
}

export function emitCheckinUpdate(io, eventId, data) {
  if (!io) return;
  io.to(dashboardRoom(eventId)).emit("checkin:update", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function emitRegistrationNew(io, eventId, data) {
  if (!io) return;
  io.to(dashboardRoom(eventId)).emit("registration:new", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function emitScanResult(io, eventId, data) {
  if (!io) return;
  io.to(scanRoom(eventId)).emit("scan:result", data);
}
