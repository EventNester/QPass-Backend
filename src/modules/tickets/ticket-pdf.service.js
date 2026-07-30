import PDFDocument from 'pdfkit';

/**
 * Generates a PDF buffer for a single ticket.
 * @param {Object} registration - The registration record (includes event, ticketCode, ticketType)
 * @param {string} qrDataUrl - The base64 data URL of the QR code
 * @returns {Promise<Buffer>} The generated PDF as a buffer
 */
export async function generateIndividualTicketPdf(registration, qrDataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // QPass Header
      doc.fontSize(24).font('Helvetica-Bold').text('QPass Ticket', { align: 'center' });
      doc.moveDown(2);

      // Event Details
      const event = registration.event || {};
      doc.fontSize(18).text(event.title || 'Event Name', { underline: true });
      doc.fontSize(12).font('Helvetica').moveDown(0.5);
      if (event.venue) doc.text(`Venue: ${event.venue}`);
      if (event.startTime) doc.text(`Start Time: ${new Date(event.startTime).toLocaleString()}`);
      if (event.endTime) doc.text(`End Time: ${new Date(event.endTime).toLocaleString()}`);
      doc.moveDown(1.5);

      // Attendee Details
      doc.fontSize(14).font('Helvetica-Bold').text('Attendee Information');
      doc.fontSize(12).font('Helvetica').moveDown(0.5);
      doc.text(`Name: ${registration.attendeeName}`);
      doc.text(`Email: ${registration.attendeeEmail}`);
      if (registration.ticketType) {
        doc.text(`Ticket Type: ${registration.ticketType.name}`);
      }
      doc.text(`Status: ${registration.status}`);
      doc.text(`Payment: ${registration.paymentStatus}`);
      doc.text(`Confirmation Code: ${registration.confirmationCode || 'N/A'}`);
      doc.moveDown(2);

      // QR Code
      if (qrDataUrl) {
        // Strip the data:image/png;base64, prefix
        const base64Data = qrDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        doc.image(imgBuffer, {
          fit: [150, 150],
          align: 'center',
          valign: 'center'
        });
      }

      // Footer
      doc.moveDown(12);
      doc.fontSize(10).fillColor('gray').text(`Ticket Code: ${registration.ticketCode?.code || 'N/A'}`, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates a PDF buffer containing a list of exported tickets.
 * @param {Array} registrations - The array of registration records
 * @param {Object} event - The event record
 * @returns {Promise<Buffer>} The generated PDF as a buffer
 */
export async function generateTicketListPdf(registrations, event) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(`Ticket List: ${event.title}`, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table Headers
      const colX = [40, 200, 350, 500, 600, 700];
      const startY = doc.y;

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Name', colX[0], startY);
      doc.text('Email', colX[1], startY);
      doc.text('Ticket Type', colX[2], startY);
      doc.text('Status', colX[3], startY);
      doc.text('Payment', colX[4], startY);
      doc.text('Ticket Code', colX[5], startY);
      
      doc.moveTo(40, startY + 15).lineTo(750, startY + 15).stroke();
      
      let currentY = startY + 20;

      // Table Rows
      doc.font('Helvetica').fontSize(9);
      for (const reg of registrations) {
        if (currentY > 500) {
          doc.addPage();
          currentY = 40;
        }

        doc.text(reg.attendeeName || 'N/A', colX[0], currentY);
        doc.text(reg.attendeeEmail || 'N/A', colX[1], currentY);
        doc.text(reg.ticketType?.name || 'N/A', colX[2], currentY);
        doc.text(reg.status || 'N/A', colX[3], currentY);
        doc.text(reg.paymentStatus || 'N/A', colX[4], currentY);
        doc.text(reg.ticketCode?.code || 'N/A', colX[5], currentY);

        currentY += 15;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
