const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Genera un reporte en formato PDF y lo guarda en el disco (100% idéntico al de SECAM).
 * @param {Object} report Objeto Reporte creado en base de datos.
 * @param {Array} details Array de objetos ReporteDetalle con los datos de las cámaras.
 * @param {string} empresaNombre Nombre de la empresa (tenant).
 * @param {string} empresaSlug Slug de la empresa (scala, condado, pomasqui).
 * @param {string} outputPath Ruta completa de salida del PDF.
 * @returns {Promise<string>} Ruta del archivo PDF generado.
 */
const generateReportPDF = (
  report,
  details,
  empresaNombre,
  empresaSlug,
  outputPath,
) => {
  return new Promise((resolve, reject) => {
    try {
      // Inicializar documento con márgenes más precisos
      const doc = new PDFDocument({
        margin: { top: 50, bottom: 65, left: 50, right: 50 },
        bufferPages: true,
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // --- PALETA DE COLORES UNIFICADA Y LOGO SEGÚN MALL ---
      const PRIMARY_COLOR = "#0f172a"; // Slate 900
      const SECONDARY_COLOR = "#6366f1"; // Indigo 500
      const LIGHT_BG = "#f8fafc"; // Slate 50
      const SUCCESS_COLOR = "#10b981"; // Emerald 500 (🟢)
      const DANGER_COLOR = "#ef4444"; // Red 500 (🔴)
      const TEXT_COLOR = "#334155"; // Slate 700

      let logoFilename = null;

      if (empresaSlug === "scala") {
        logoFilename = "logoscala.png";
      } else if (empresaSlug === "condado") {
        logoFilename = "logocondado.png";
      } else if (empresaSlug === "pomasqui") {
        logoFilename = "logopomasqui.png";
      }

      const logoPath = logoFilename
        ? path.join(__dirname, "..", "public", "logos", logoFilename)
        : null;

      // --- CABECERA ---
      // Dibujar una línea sutil decorativa en el extremo superior de la hoja
      doc
        .fillColor(PRIMARY_COLOR)
        .rect(0, 0, 612, 10) // Ancho de carta
        .fill();

      // Título SICC con tipografía limpia y espaciado
      doc
        .fillColor("#0f172a") // Slate 900
        .fontSize(22)
        .text("SICC", 50, 30, { bold: true });

      doc
        .fillColor("#64748b") // Slate 500
        .fontSize(8)
        .text("SISTEMA INTEGRADO DE CONTROL Y CÁMARAS", 50, 53, {
          characterSpacing: 1.2,
        });

      // Dibujar Logo si existe con dimensiones adaptadas según el centro comercial
      if (logoPath && fs.existsSync(logoPath)) {
        try {
          let logoOptions = { align: "right", valign: "center" };
          let logoX = 465;
          let logoY = 23;

          if (empresaSlug === "pomasqui") {
            // Logo ancho (pomasqui)
            logoOptions.fit = [115, 80];
            logoX = 450;
            logoY = 5;
          } else {
            // Logos cuadrados (scala, condado)
            logoOptions.fit = [80, 80];
            logoX = 480;
            logoY = 10;
          }
          doc.image(logoPath, logoX, logoY, logoOptions);
        } catch (imgErr) {
          console.error(`Error al insertar logo en PDF: ${imgErr.message}`);
        }
      }

      // --- DATOS GENERALES (Diseño en Tarjeta Ficha Técnica) ---
      const detailsY = 95;
      const detailsHeight = 44;

      // Fondo de la tarjeta (Gris azulado muy suave)
      doc
        .fillColor("#f8fafc")
        .roundedRect(50, detailsY, 500, detailsHeight, 4)
        .fill();

      // Borde izquierdo en color primario para dar impacto visual
      doc
        .fillColor(PRIMARY_COLOR)
        .rect(50, detailsY, 3.5, detailsHeight)
        .fill();

      // Texto dentro de la tarjeta
      doc.fontSize(9).fillColor(TEXT_COLOR);

      // Columna 1 (X=65 para dejar espacio al borde de color)
      doc
        .text(`Centro Comercial: `, 65, detailsY + 9, {
          bold: true,
          continued: true,
        })
        .text(empresaNombre, { bold: false })
        .text(`Responsable: `, { bold: true, continued: true })
        .text(report.responsable_nombre || "Operador", { bold: false });

      // Columna 2
      const fechaFormateada = new Date(
        report.created_at || report.fecha,
      ).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
      doc
        .text(`Fecha de Reporte: `, 320, detailsY + 16, {
          bold: true,
          continued: true,
        })
        .text(fechaFormateada, { bold: false });

      // --- RESUMEN DE CÁMARAS (Tarjetas de estado estilo Dashboard) ---
      const cardY = 162;
      const cardHeight = 50;
      doc.rect(50, cardY, 500, cardHeight).fill(LIGHT_BG);
      doc.strokeColor("#cbd5e1").rect(50, cardY, 500, cardHeight).stroke();

      // Líneas divisorias del Dashboard
      doc
        .strokeColor("#cbd5e1")
        .lineWidth(0.5)
        .moveTo(216, cardY)
        .lineTo(216, cardY + cardHeight)
        .moveTo(383, cardY)
        .lineTo(383, cardY + cardHeight)
        .stroke();

      // Columna 1: Total
      doc
        .fillColor(SECONDARY_COLOR)
        .fontSize(8)
        .text("TOTAL CÁMARAS", 50, cardY + 12, { align: "center", width: 166 });
      doc
        .fillColor(PRIMARY_COLOR)
        .fontSize(14)
        .text(`${report.total_camaras}`, 50, cardY + 24, {
          align: "center",
          width: 166,
          bold: true,
        });

      // Columna 2: Operativas
      doc
        .fillColor(SUCCESS_COLOR)
        .fontSize(8)
        .text("OPERATIVAS", 216, cardY + 12, { align: "center", width: 167 });
      doc
        .fillColor(SUCCESS_COLOR)
        .fontSize(14)
        .text(`${report.operativas}`, 216, cardY + 24, {
          align: "center",
          width: 167,
          bold: true,
        });

      // Columna 3: No Operativas
      doc
        .fillColor(DANGER_COLOR)
        .fontSize(8)
        .text("CON FALLA", 383, cardY + 12, { align: "center", width: 167 });
      doc
        .fillColor(DANGER_COLOR)
        .fontSize(14)
        .text(`${report.no_operativas}`, 383, cardY + 24, {
          align: "center",
          width: 167,
          bold: true,
        });

      // --- TABLA DETALLE ---
      doc
        .fillColor(PRIMARY_COLOR)
        .fontSize(12)
        .text("DETALLE DE INVENTARIO E INSPECCIÓN", 50, 232, { bold: true });

      // Dibujar encabezados de tabla
      let y = 252;
      doc.rect(50, y, 500, 20).fill(PRIMARY_COLOR);
      doc.fillColor("#ffffff").fontSize(8);
      doc.text("CÁMARA / DETALLES", 60, y + 6, { bold: true, width: 170 });
      doc.text("SECTOR / NIVEL", 240, y + 6, { bold: true, width: 110 });
      doc.text("TIPO / MODELO", 360, y + 6, { bold: true, width: 110 });
      doc.text("ESTADO", 480, y + 6, { bold: true, width: 70 });

      y += 20;

      // Agrupar detalles por propietario
      const groupedDetails = {};
      for (const item of details) {
        const propName = item.propietario_nombre || "Sin Propietario";
        if (!groupedDetails[propName]) {
          groupedDetails[propName] = [];
        }
        groupedDetails[propName].push(item);
      }

      // Dibujar grupos
      let rowIdx = 0;
      for (const propName of Object.keys(groupedDetails)) {
        const items = groupedDetails[propName];

        // Verificar si requerimos una nueva página para la cabecera de grupo
        if (y > 660) {
          doc.addPage();
          y = 50;
          doc.rect(50, y, 500, 20).fill(PRIMARY_COLOR);
          doc.fillColor("#ffffff").fontSize(8);
          doc.text("CÁMARA / DETALLES", 60, y + 6, { bold: true, width: 170 });
          doc.text("SECTOR / NIVEL", 240, y + 6, { bold: true, width: 110 });
          doc.text("TIPO / MODELO", 360, y + 6, { bold: true, width: 110 });
          doc.text("ESTADO", 480, y + 6, { bold: true, width: 70 });
          y += 20;
        }

        // Renderizar cabecera de grupo de propietario
        doc.rect(50, y, 500, 16).fill("#e2e8f0");
        doc
          .fillColor(PRIMARY_COLOR)
          .fontSize(7.5)
          .text(`PROPIETARIO: ${propName.toUpperCase()}`, 60, y + 4.5, {
            bold: true,
          });
        y += 16;

        // Renderizar cámaras de este propietario
        for (const item of items) {
          const nameHeight = doc
            .fontSize(8)
            .heightOfString(item.nombre_camara, { width: 170 });
          let subText = [];
          if (item.codigo_camara) subText.push(`Cod: ${item.codigo_camara}`);
          if (item.observacion) subText.push(`Obs: ${item.observacion}`);

          let subTextHeight = 0;
          const subTextStr = subText.join(" | ");
          if (subText.length > 0) {
            subTextHeight = doc
              .fontSize(7)
              .heightOfString(subTextStr, { width: 170 });
          }

          const rowHeight = Math.max(28, nameHeight + subTextHeight + 8);

          if (y + rowHeight > 675) {
            doc.addPage();
            y = 50;
            doc.rect(50, y, 500, 20).fill(PRIMARY_COLOR);
            doc.fillColor("#ffffff").fontSize(8);
            doc.text("CÁMARA / DETALLES", 60, y + 6, {
              bold: true,
              width: 170,
            });
            doc.text("SECTOR / NIVEL", 240, y + 6, { bold: true, width: 110 });
            doc.text("TIPO / MODELO", 360, y + 6, { bold: true, width: 110 });
            doc.text("ESTADO", 480, y + 6, { bold: true, width: 70 });
            y += 20;

            doc.rect(50, y, 500, 16).fill("#e2e8f0");
            doc
              .fillColor(PRIMARY_COLOR)
              .fontSize(7.5)
              .text(
                `PROPIETARIO: ${propName.toUpperCase()} (CONTINUACIÓN)`,
                60,
                y + 4.5,
                { bold: true },
              );
            y += 16;
          }

          if (rowIdx % 2 === 0) {
            doc.rect(50, y, 500, rowHeight).fill(LIGHT_BG);
          } else {
            doc.rect(50, y, 500, rowHeight).fill("#ffffff");
          }
          rowIdx++;

          doc.fillColor(TEXT_COLOR).fontSize(8);

          doc.text(item.nombre_camara, 60, y + 4, { bold: true, width: 170 });
          if (subText.length > 0) {
            doc
              .fillColor(SECONDARY_COLOR)
              .fontSize(7)
              .text(subTextStr, 60, y + 4 + nameHeight + 2, { width: 170 });
          }

          doc.fillColor(TEXT_COLOR).fontSize(8);
          doc.text(`${item.sector_nombre}\n${item.nivel_nombre}`, 240, y + 4, {
            width: 110,
          });
          doc.text(`${item.tipo_nombre}\n${item.modelo_nombre}`, 360, y + 4, {
            width: 110,
          });

          const dotY = y + rowHeight / 2;
          doc
            .fillColor(item.estado ? SUCCESS_COLOR : DANGER_COLOR)
            .circle(488, dotY, 3.5)
            .fill();
          doc
            .fillColor(TEXT_COLOR)
            .text(item.estado ? "Operativa" : "Falla", 496, dotY - 4, {
              width: 50,
            });

          y += rowHeight;
        }
      }

      // Pie de Página
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.options.autoPageBreak = false;

        doc
          .strokeColor("#cbd5e1")
          .lineWidth(0.5)
          .moveTo(50, 740)
          .lineTo(550, 740)
          .stroke();

        doc
          .fontSize(7)
          .fillColor(SECONDARY_COLOR)
          .text("SICC | Sistema Integrado de Control y Cámaras", 50, 748, {
            align: "left",
            lineBreak: false,
          });

        doc.text(`Página ${i + 1} de ${range.count}`, 450, 748, {
          align: "right",
          width: 100,
          lineBreak: false,
        });

        doc.page.margins.bottom = oldBottomMargin;
        doc.options.autoPageBreak = true;
      }

      doc.end();

      writeStream.on("finish", () => {
        resolve(outputPath);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateReportPDF,
};
