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

      const margin = 40;
      const usableWidth = 842 - margin * 2;
      const colWidths = [140, 200, 120, 90, 90, usableWidth - 140 - 200 - 120 - 90 - 90];
      const colX = [];
      let acc = margin;
      for (const w of colWidths) {
        colX.push(acc);
        acc += w;
      }

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(`Ticket List: ${event.title}`, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      const pageBottomLimit = 535;
      const headerLabels = ['Name', 'Email', 'Ticket Type', 'Status', 'Payment', 'Ticket Code'];

      function drawTableHeader(y) {
        doc.font('Helvetica-Bold').fontSize(10);
        for (let i = 0; i < headerLabels.length; i++) {
          doc.text(headerLabels[i], colX[i], y, { width: colWidths[i], lineBreak: false });
        }
        doc.moveTo(margin, y + 12).lineTo(842 - margin, y + 12).stroke();
        return y + 15;
      }

      let currentY = drawTableHeader(doc.y);

      // Table Rows
      doc.font('Helvetica').fontSize(9);
      for (const reg of registrations) {
        const cells = [
          reg.attendeeName || 'N/A',
          reg.attendeeEmail || 'N/A',
          reg.ticketType?.name || 'N/A',
          reg.status || 'N/A',
          reg.paymentStatus || 'N/A',
          reg.ticketCode?.code || 'N/A',
        ];

        let maxHeight = 0;
        for (let i = 0; i < cells.length; i++) {
          const h = doc.heightOfString(cells[i], { width: colWidths[i], lineBreak: true });
          if (h > maxHeight) maxHeight = h;
        }

        if (currentY + maxHeight + 5 > pageBottomLimit) {
          doc.addPage();
          currentY = drawTableHeader(margin);
        }

        for (let i = 0; i < cells.length; i++) {
          doc.text(cells[i], colX[i], currentY, { width: colWidths[i], lineBreak: true });
        }

        currentY += maxHeight + 5;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
