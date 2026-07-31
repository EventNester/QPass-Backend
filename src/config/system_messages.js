export default {
  SUCCESS: {
    AUTH: {
      REGISTER: "Account created successfully",
      LOGIN: "Login successful",
      LOGOUT: "Logged out successfully",
      TOKEN_REFRESHED: "Token refreshed successfully",
      PASSWORD_RESET_SENT: "Password reset instructions sent to your email",
      PASSWORD_RESET_SUCCESS: "Password reset successfully",
    },

    REGISTRATION: {
      CREATED: "Registration completed successfully",
      QR_SENT: "QR code sent successfully",
    },

    EMAIL: {
      SENT: "Email sent successfully",
    },


    NOTIFICATION: {
      SENT: "Notification sent successfully",
    },

    IMPORT: {
      COMPLETED: "Import completed successfully",
    },
    EVENT: {
      CREATED: "Event created successfully",
      UPDATED: "Event updated successfully",
      DELETED: "Event deleted successfully",
      PUBLISHED: "Event published successfully",
      CANCELLED: "Event cancelled successfully",
    },
    TICKET: {
      CODES_UPLOADED: "Ticket codes uploaded successfully",
      VERIFIED: "Ticket verified successfully",
      QR_GENERATED: "QR code generated successfully",
    },
    CHECKIN: {
      SUCCESS: "Check-in recorded successfully",
      UNDONE: "Check-in undone successfully",
    },
    PAYMENT: {
      INITIALIZED: "Payment initialized successfully",
      VERIFIED: "Payment verified successfully",
    },
    STAFF: {
      ASSIGNED: "Staff assigned successfully",
      LISTED: "Staff list retrieved successfully",
      REMOVED: "Staff removed successfully",
    },
    REPORT: {
      GENERATED: "Report generated successfully",
      EXPORTED: "Data exported successfully",
    },
  },


  ERROR: {
    AUTH: {
      INVALID_CREDENTIALS: "Invalid email or password",
      TOKEN_EXPIRED: "Token has expired",
      TOKEN_INVALID: "Invalid token",
      TOKEN_INVALID_OR_EXPIRED: "Invalid or expired token",
      TOKEN_REFRESH_REVOKED: "Refresh token has been revoked",
      TOKEN_REFRESH_INVALID: "Invalid or expired refresh token",
      UNAUTHORIZED: "Unauthorized access",
      FORBIDDEN: "Access forbidden",
      ACCOUNT_SUSPENDED: "Account has been suspended",
      ALREADY_EXISTS: "Account already exists with this email",
      TOO_MANY_ATTEMPTS: "Too many authentication attempts, please try again later",
      RESET_TOKEN_INVALID: "Invalid or expired password reset token",
    },
    EVENT: {
      NOT_FOUND: "Event not found",
      ALREADY_EXISTS: "Event with this title already exists",
      UNAUTHORIZED: "You are not the owner of this event",
      CANNOT_DELETE: "Cannot delete event with active registrations",
      NOT_DRAFT: "Event is not in draft status",
      CANNOT_CANCEL_DRAFT: "Cannot cancel a draft event",
      ALREADY_CANCELLED: "Event is already cancelled",
    },
    TICKET: {
      INVALID_CODE: "Invalid ticket code",
      CODE_USED: "Ticket code has already been used",
      CODE_REVOKED: "Ticket code has been revoked",
      NOT_FOUND: "Ticket code not found",
      ALREADY_EXISTS: "QR token already exists for this registration",
      INVALID_QR: "Invalid QR token",
      EXPIRED: "QR token has expired",
      REVOKED: "QR token has been revoked",
    },
    CHECKIN: {
      DUPLICATE: "Duplicate check-in detected",
      INVALID_QR: "Invalid QR code",
      QR_EXPIRED: "QR code has expired",
      QR_REVOKED: "QR code has been revoked",
      NOT_AUTHORIZED: "You are not authorized to scan for this event",
      SCAN_IN_PROGRESS: "Scan already in progress",
      EVENT_MISMATCH: "QR code is not valid for this event",
      NOT_FOUND: "Check-in not found",
    },
    PAYMENT: {
      FAILED: "Payment verification failed",
      ALREADY_VERIFIED: "Payment has already been verified",
      INVALID_REFERENCE: "Invalid payment reference",
    },
    STAFF: {
      ALREADY_ASSIGNED: "Staff member is already assigned to this event",
      NOT_FOUND: "Staff assignment not found",
    },
    GENERAL: {
      NOT_FOUND: "Resource not found",
      ALREADY_EXISTS: "Resource already exists",
      CONFLICT: "Resource conflict",
      ROUTE_NOT_FOUND: "Route not found",
      VALIDATION_ERROR: "Validation error",
      INTERNAL_ERROR: "Internal server error",
      SERVICE_UNAVAILABLE: "Service temporarily unavailable",
      TOO_MANY_REQUESTS: "Too many requests, please try again later",
      DB_CONNECTION_FAILED: "Database connection failed",
      SERVER_START_FAILED: "Failed to start server",
    },
    UPLOAD: {
      MISSING_FILE: "No file uploaded",
      INVALID_TYPE: "Invalid file type. Allowed formats: CSV, XLSX, PDF, DOCX",
      TOO_LARGE: "File exceeds the 5MB size limit",
      GENERIC: "File upload failed",
    },
    IMPORT: {
      CSV_PARSE_FAILED: "Failed to parse CSV file",
      XLSX_PARSE_FAILED: "Failed to parse XLSX file",
      PDF_PARSE_FAILED: "Failed to parse PDF file",
      DOCX_PARSE_FAILED: "Failed to parse DOCX file",
      NO_WORKSHEETS: "No worksheets found in XLSX file",
      INVALID_BUFFER: "Invalid file buffer",
      ROW_LIMIT_EXCEEDED: "File exceeds the maximum allowed number of rows",
    },

    REGISTRATION: {
      EVENT_CLOSED: "Registration is closed for this event",
      EVENT_FULL: "Event capacity has been reached",
      ALREADY_REGISTERED: "You have already registered for this event",
      TICKET_TYPE_FULL: "Selected ticket type is sold out",
      INVALID_TICKET_TYPE: "Invalid ticket type",
    },

    EMAIL: {
      FAILED: "Failed to send email",
    },

    NOTIFICATION: {
      FAILED: "Failed to send notification",
    },
  },

  VALIDATION: {
    NAME_REQUIRED: "Name is required",
    INVALID_EMAIL: "Invalid email address",
    PASSWORD_MIN: "Password must be at least 8 characters",
    PASSWORD_LOWERCASE: "Password must contain a lowercase letter",
    PASSWORD_UPPERCASE: "Password must contain an uppercase letter",
    PASSWORD_NUMBER: "Password must contain a number",
    PASSWORD_REQUIRED: "Password is required",
    TOKEN_REQUIRED: "Refresh token is required",
    RESET_TOKEN_REQUIRED: "Reset token is required",
    IMPORT: {
      MISSING_NAME: "Name is required",
      CONTACT_REQUIRED: "At least one of email or phone is required",
      INVALID_EMAIL_FORMAT: "Invalid email format",
      INVALID_PHONE: "Invalid phone number format",
      DUPLICATE_EMAIL: "Duplicate email within the same batch",
      DUPLICATE_PHONE: "Duplicate phone within the same batch",
      DUPLICATE_EMAIL_EVENT: "Email already registered for this event",
      DUPLICATE_PHONE_EVENT: "Phone already registered for this event",
      UNKNOWN_TICKET_TYPE: "Unknown ticket type",
      CAPACITY_EXCEEDED: "Event or ticket type capacity exceeded",
      EMPTY_ROW: "Row must contain at least a name and contact info",
    },

    PHONE_REQUIRED: "Phone number is required",
    TICKET_TYPE_REQUIRED: "Ticket type is required",
  },

  INFO: {
    HEALTH: {
      OK: "Service is healthy",
      DEGRADED: "Service is running in degraded mode",
    },
    SERVER: {
      RUNNING: "Server running on port",
      DB_CONNECTED: "Database connected",
      REDIS_CONNECTED: "Redis initialized",
      SHUTTING_DOWN: "Shutting down",
    },
  },
};
