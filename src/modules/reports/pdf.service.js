import PDFDocument from "pdfkit";

export function generateTablePdf({ title, headers, rows }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const margin = 40;
      const pageWidth = 842;
      const usableWidth = pageWidth - margin * 2;

      const totalWeight = headers.reduce(
        (sum, header) => sum + Math.max(header.length, 8),
        0
      );
      const colWidths = headers.map((header) =>
        Math.floor((usableWidth * Math.max(header.length, 8)) / totalWeight)
      );
      const colX = [];
      let acc = margin;
      for (const width of colWidths) {
        colX.push(acc);
        acc += width;
      }

      doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "center" });
      doc.fontSize(12).font("Helvetica").text(
        `Generated on: ${new Date().toLocaleString()}`,
        { align: "center" }
      );
      doc.moveDown(2);

      const pageBottomLimit = 535;

      function drawTableHeader(y) {
        doc.font("Helvetica-Bold").fontSize(10);
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colX[i], y, { width: colWidths[i], lineBreak: false });
        }
        doc.moveTo(margin, y + 12).lineTo(pageWidth - margin, y + 12).stroke();
        return y + 15;
      }

      let currentY = drawTableHeader(doc.y);

      doc.font("Helvetica").fontSize(9);
      for (const row of rows) {
        const cells = headers.map((_, index) => {
          const value = row[index];
          const str = value === null || value === undefined ? "" : String(value);
          return str || "-";
        });

        let maxHeight = 0;
        for (let i = 0; i < cells.length; i++) {
          const height = doc.heightOfString(cells[i], {
            width: colWidths[i],
            lineBreak: true,
          });
          if (height > maxHeight) maxHeight = height;
        }

        if (currentY + maxHeight + 5 > pageBottomLimit) {
          doc.addPage();
          currentY = drawTableHeader(margin);
        }

        for (let i = 0; i < cells.length; i++) {
          doc.text(cells[i], colX[i], currentY, {
            width: colWidths[i],
            lineBreak: true,
          });
        }

        currentY += maxHeight + 5;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
