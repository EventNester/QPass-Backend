import { exportRegistrations, exportAttendance } from "./export.service.js";

const sendExport = async (req, res, next, exporter, baseName) => {
  try {
    const { eventId } = req.params;
    const format = req.query.format || "csv";
    const { contentType, data, extension } = await exporter(eventId, req.user.id, req.user.role, format);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${extension}"`);
    return res.send(data);
  } catch (error) {
    next(error);
  }
};

export const exportRegistrationsController = async (req, res, next) =>
  sendExport(req, res, next, exportRegistrations, "registrations-export");

export const exportAttendanceController = async (req, res, next) =>
  sendExport(req, res, next, exportAttendance, "attendance-export");
