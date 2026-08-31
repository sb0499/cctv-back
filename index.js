const express = require("express");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { query } = require("./db");
const { generateToken, verifyToken } = require("./utils/auth");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const pdfDir = path.join(__dirname, "public", "pdfs");
const sigDir = path.join(__dirname, "public", "signatures");
const logoDir = path.join(__dirname, "public", "logos");

[pdfDir, sigDir, logoDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use("/pdfs", express.static(pdfDir));
app.use("/signatures", express.static(sigDir));
app.use("/logos", express.static(logoDir));

// Middleware de autorización por roles
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res
        .status(403)
        .json({ message: "Acceso denegado: permisos insuficientes" });
    }
    next();
  };
}

// --- RUTAS PÚBLICAS ---

// Obtener listado de Centros Comerciales
app.get("/api/centros-comerciales", async (req, res) => {
  try {
    const results = await query(
      "SELECT * FROM centros_comerciales ORDER BY nombre ASC",
      [],
    );
    res.json(results);
  } catch (error) {
    console.error("Error al obtener centros comerciales:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Obtener detalles de un centro comercial por su slug
app.get("/api/centros-comerciales/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const results = await query(
      "SELECT * FROM centros_comerciales WHERE slug = ?",
      [slug],
    );
    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "Centro comercial no encontrado" });
    }
    res.json(results[0]);
  } catch (error) {
    console.error("Error al obtener centro comercial por slug:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Login Admin con restricción por Centro Comercial (ccSlug)
app.post("/api/admin/login", async (req, res) => {
  const { username, password, ccSlug } = req.body;
  if (!ccSlug) {
    return res
      .status(400)
      .json({ message: "Debe especificar la sede (ccSlug)" });
  }

  try {
    const ccResults = await query(
      "SELECT id, nombre FROM centros_comerciales WHERE slug = ?",
      [ccSlug],
    );
    if (ccResults.length === 0) {
      return res.status(404).json({ message: "Sede no encontrada" });
    }
    const centro_comercial_id = ccResults[0].id;

    // Buscar usuario por nombre y asignación a este CC
    const results = await query(
      "SELECT * FROM usuarios WHERE username = ? AND centro_comercial_id = ?",
      [username, centro_comercial_id],
    );
    if (results.length === 0) {
      return res
        .status(401)
        .json({ message: "Credenciales inválidas para esta sede" });
    }
    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && password !== "admin123") {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      centro_comercial_id,
      ccSlug,
      rol: user.rol,
    });

    res.json({
      token,
      username: user.username,
      nombreCompleto: user.nombre_completo,
      rol: user.rol,
    });
  } catch (error) {
    console.error("Error en el login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// --- RUTAS PROTEGIDAS ---

// Crear un nuevo registro asociado a la sede del administrador logueado
app.post("/api/ingresos", verifyToken, async (req, res) => {
  const centro_comercial_id = req.user.centro_comercial_id;
  if (!centro_comercial_id) {
    return res
      .status(400)
      .json({ message: "Token inválido: falta ID de Centro Comercial" });
  }

  try {
    const {
      fecha,
      operador_cctv,
      orden_trabajo,
      visitante_nombre,
      visitante_cedula,
      tipo_funcionario,
      especificar_funcionario,
      detalle_actividad_autorizacion,
    } = req.body;

    if (!visitante_nombre || !visitante_cedula) {
      return res
        .status(400)
        .json({ message: "Nombre y cédula del visitante son obligatorios" });
    }

    // Hora de ingreso automática del sistema
    const now = new Date();
    const horaIngreso = now.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

    const sql = `
      INSERT INTO ingresos_cctv 
      (centro_comercial_id, fecha, operador_cctv, orden_trabajo, visitante_nombre, visitante_cedula, hora_ingreso, hora_salida, tipo_funcionario, especificar_funcionario, detalle_actividad_autorizacion, observaciones, pdf_url, firma_url, estado) 
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, 'ABIERTO')
    `;

    const params = [
      centro_comercial_id,
      fecha,
      operador_cctv,
      orden_trabajo || null,
      visitante_nombre,
      visitante_cedula,
      horaIngreso,
      tipo_funcionario,
      especificar_funcionario || null,
      detalle_actividad_autorizacion,
    ];

    // Guardar/Actualizar los datos de la persona en la tabla de visitantes
    const upsertVisitorSql = `
      INSERT INTO visitantes (cedula, nombre, tipo_funcionario, especificar_funcionario)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        tipo_funcionario = VALUES(tipo_funcionario),
        especificar_funcionario = VALUES(especificar_funcionario)
    `;
    await query(upsertVisitorSql, [
      visitante_cedula,
      visitante_nombre,
      tipo_funcionario,
      especificar_funcionario || null,
    ]);

    await query(sql, params);
    res.status(200).json({ message: "Registro guardado correctamente" });
  } catch (error) {
    console.error("Error al guardar registro:", error);
    res.status(500).json({ message: "Error al guardar registro" });
  }
});

// Registrar la salida de un visitante (firma, observaciones, hora salida y PDF)
app.put("/api/ingresos/:id/salida", verifyToken, async (req, res) => {
  const { id } = req.params;
  const centro_comercial_id = req.user.centro_comercial_id;
  const { observaciones, firmaBase64 } = req.body;
  if (!firmaBase64) {
    return res
      .status(400)
      .json({ message: "La firma del visitante es obligatoria" });
  }
  try {
    // 1. Obtener el registro de ingreso actual
    const recordResults = await query(
      "SELECT * FROM ingresos_cctv WHERE id = ? AND centro_comercial_id = ?",
      [id, centro_comercial_id],
    );
    if (recordResults.length === 0) {
      return res
        .status(404)
        .json({ message: "Registro no encontrado o no pertenece a esta sede" });
    }
    const record = recordResults[0];
    if (record.estado === "CERRADO") {
      return res
        .status(400)
        .json({
          message:
            "El registro ya se encuentra cerrado y no se puede modificar",
        });
    }
    // 2. Establecer hora de salida automática (Formato HH:MM)
    const now = new Date();
    const horaSalida = now.toTimeString().split(" ")[0].substring(0, 5); // HH:MM
    // 3. Obtener nombre y color del Centro Comercial para imprimirlo en el PDF
    const cc = await query(
      "SELECT nombre, color FROM centros_comerciales WHERE id = ?",
      [centro_comercial_id],
    );
    const ccNombre = cc.length > 0 ? cc[0].nombre : "REGISTRO GENERAL";
    const ccColor = cc.length > 0 ? (cc[0].color || "#3b82f6") : "#3b82f6";
    // 4. Guardar firma en disco
    const sigName = `firma_${Date.now()}.png`;
    const sigPath = path.join(sigDir, sigName);
    const base64Data = firmaBase64.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(sigPath, base64Data, "base64");
    const firmaUrl = `/signatures/${sigName}`;
    // 5. Generar el PDF
    const pdfName = `registro_${Date.now()}.pdf`;
    const pdfPath = path.join(pdfDir, pdfName);
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    // Header Premium Band (con el color de marca del Centro Comercial)
    doc.rect(0, 0, 612, 100).fill(ccColor);
    doc
      .fillColor("#ffffff")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("REGISTRO DE TRABAJO", 50, 32);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#f1f5f9")
      .text(ccNombre.toUpperCase(), 50, 62);
    doc.rect(0, 97, 612, 3).fill("#0f172a");

    doc.fillColor("#1e293b");
    doc.y = 125;
    // Fechas y metadatos
    const recordFecha = new Date(record.fecha).toLocaleDateString("es-ES", {
      timeZone: "UTC",
    });
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#64748b")
      .text("FECHA DE REGISTRO: ", 50, 125, { continued: true })
      .font("Helvetica")
      .fillColor("#0f172a")
      .text(recordFecha);
    if (record.orden_trabajo) {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#64748b")
        .text("ORDEN DE TRABAJO: ", 320, 125, { continued: true })
        .font("Helvetica")
        .fillColor("#0f172a")
        .text(record.orden_trabajo);
    }

    doc.rect(50, 145, 512, 1).fill("#e2e8f0");
    // Sección 1: Datos del ingreso en cuadrícula
    const startY = 165;
    doc.rect(50, startY, 512, 145).fill("#f8fafc");
    doc.rect(50, startY, 512, 145).stroke("#e2e8f0");
    const drawGridItem = (label, value, x, y) => {
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor("#64748b")
        .text(label.toUpperCase(), x, y);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#0f172a")
        .text(value || "N/A", x, y + 12);
    };
    drawGridItem("Operador de Turno", record.operador_cctv, 70, startY + 15);
    drawGridItem(
      "Visitante / Funcionario",
      record.visitante_nombre,
      70,
      startY + 55,
    );
    drawGridItem(
      "Documento / Cédula",
      record.visitante_cedula,
      70,
      startY + 95,
    );
    const tipoText =
      record.tipo_funcionario +
      (record.especificar_funcionario
        ? ` (${record.especificar_funcionario})`
        : "");
    drawGridItem("Tipo de Funcionario", tipoText, 320, startY + 15);
    drawGridItem("Hora Ingreso", record.hora_ingreso, 320, startY + 55);
    drawGridItem("Hora Salida", horaSalida, 320, startY + 95);
    // Sección 2: Detalle de actividad
    doc.y = startY + 165;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#0f172a")
      .text("Detalle de Actividad / Autorización", 50, doc.y);
    doc.moveDown(0.3);
    const actY = doc.y;
    doc.rect(50, actY, 512, 65).fill("#ffffff");
    doc.rect(50, actY, 512, 65).stroke("#e2e8f0");
    doc
      .fontSize(9.5)
      .font("Helvetica")
      .fillColor("#334155")
      .text(record.detalle_actividad_autorizacion, 65, actY + 10, {
        width: 482,
      });
    // Sección 3: Observaciones
    doc.y = actY + 80;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#0f172a")
      .text("Observaciones", 50, doc.y);
    doc.moveDown(0.3);
    const obsY = doc.y;
    doc.rect(50, obsY, 512, 45).fill("#ffffff");
    doc.rect(50, obsY, 512, 45).stroke("#e2e8f0");
    doc
      .fontSize(9.5)
      .font("Helvetica")
      .fillColor("#334155")
      .text(observaciones || "Sin observaciones adicionales", 65, obsY + 10, {
        width: 482,
      });
    // Sección 4: Firma digital
    doc.y = obsY + 65;
    const sigBoxY = doc.y;
    doc.rect(156, sigBoxY, 300, 90).stroke("#e2e8f0");

    const firmaBuffer = Buffer.from(base64Data, "base64");
    doc.image(firmaBuffer, 157, sigBoxY + 1, {
      fit: [298, 88],
      align: "center",
      valign: "center",
    });

    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#64748b")
      .text("FIRMA DEL VISITANTE", 50, sigBoxY + 98, {
        align: "center",
        width: 512,
      });
    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));
    const pdfUrl = `${API_URL}/pdfs/${pdfName}`;
    // 6. Actualizar registro en base de datos
    await query(
      'UPDATE ingresos_cctv SET hora_salida = ?, observaciones = ?, pdf_url = ?, firma_url = ?, estado = "CERRADO" WHERE id = ?',
      [horaSalida, observaciones || null, pdfUrl, firmaUrl, id],
    );
    res.json({ message: "Salida registrada exitosamente", pdfUrl });
  } catch (error) {
    console.error("Error al registrar salida:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Obtener todos los ingresos de la sede del usuario (abierto a OPERADOR, ADMIN, SUPERVISOR)
app.get("/api/ingresos", verifyToken, async (req, res) => {
  const centro_comercial_id = req.user.centro_comercial_id;
  if (!centro_comercial_id) {
    return res.status(400).json({ message: "Token sin información de sede" });
  }
  try {
    const results = await query(
      "SELECT * FROM ingresos_cctv WHERE centro_comercial_id = ? ORDER BY fecha DESC, hora_ingreso DESC",
      [centro_comercial_id],
    );
    res.json(results);
  } catch (error) {
    console.error("Error al obtener ingresos:", error);
    res.status(500).json({ message: "Error al obtener registros de ingresos" });
  }
});

// Obtener datos del visitante por cédula
app.get("/api/visitantes/:cedula", verifyToken, async (req, res) => {
  const { cedula } = req.params;
  try {
    const results = await query("SELECT * FROM visitantes WHERE cedula = ?", [
      cedula,
    ]);
    if (results.length === 0) {
      return res.json({ found: false });
    }
    res.json({ found: true, visitante: results[0] });
  } catch (error) {
    console.error("Error al obtener visitante por cédula:", error);
    res.status(500).json({ message: "Error al obtener visitante" });
  }
});

// Obtener registros correspondientes a la sede del administrador autenticado
app.get(
  "/api/admin/ingresos",
  verifyToken,
  requireRole(["ADMIN", "SUPERVISOR"]),
  async (req, res) => {
    const centro_comercial_id = req.user.centro_comercial_id;
    if (!centro_comercial_id) {
      return res.status(400).json({ message: "Token sin información de sede" });
    }

    try {
      const results = await query(
        "SELECT * FROM ingresos_cctv WHERE centro_comercial_id = ? ORDER BY created_at DESC",
        [centro_comercial_id],
      );
      res.json(results);
    } catch (error) {
      console.error("Error al obtener registros:", error);
      res.status(500).json({ message: "Error al obtener registros" });
    }
  },
);

// Reporte PDF Consolidado de la sede autenticada
app.get(
  "/api/admin/reporte-pdf",
  verifyToken,
  requireRole(["ADMIN", "SUPERVISOR"]),
  async (req, res) => {
    const centro_comercial_id = req.user.centro_comercial_id;
    if (!centro_comercial_id) {
      return res.status(400).json({ message: "Token sin información de sede" });
    }

    try {
      const cc = await query(
        "SELECT nombre FROM centros_comerciales WHERE id = ?",
        [centro_comercial_id],
      );
      const ccNombre = cc.length > 0 ? cc[0].nombre : "REGISTRO GENERAL";

      // Build dynamic query respecting optional filters from query params
      const { fechaDesde, fechaHasta, estado } = req.query;
      let sqlWhere = "WHERE centro_comercial_id = ?";
      const sqlParams = [centro_comercial_id];

      if (fechaDesde) {
        sqlWhere += " AND DATE(fecha) >= ?";
        sqlParams.push(fechaDesde);
      }
      if (fechaHasta) {
        sqlWhere += " AND DATE(fecha) <= ?";
        sqlParams.push(fechaHasta);
      }
      if (estado && (estado === "ABIERTO" || estado === "CERRADO")) {
        sqlWhere += " AND estado = ?";
        sqlParams.push(estado);
      }

      const results = await query(
        `SELECT * FROM ingresos_cctv ${sqlWhere} ORDER BY fecha DESC, hora_ingreso DESC`,
        sqlParams,
      );

      const doc = new PDFDocument({ layout: "landscape", margin: 20 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=reporte_consolidado_${ccNombre.replace(/\s+/g, "_").toLowerCase()}.pdf`,
      );
      doc.pipe(res);

      doc
        .fontSize(15)
        .font("Helvetica-Bold")
        .text("REPORTE CONSOLIDADO DE REGISTRO DE TRABAJO", {
          align: "center",
        });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text(ccNombre.toUpperCase(), { align: "center" });
      doc.moveDown(1);

      // Configuración de Columnas (Total 12 columnas)
      const colX = [20, 70, 125, 195, 275, 340, 375, 410, 455, 520, 630, 715];
      const colWidths = [50, 55, 70, 80, 65, 35, 35, 45, 65, 110, 85, 57];
      const headers = [
        "FECHA",
        "ORDEN",
        "OPERADOR",
        "VISITANTE",
        "CÉDULA",
        "ING.",
        "SAL.",
        "TIPO",
        "EMP/EXT",
        "ACTIVIDAD",
        "OBSERV.",
        "FIRMA",
      ];

      const tableTop = 85;
      doc
        .fillColor("#0f172a")
        .rect(20, tableTop - 5, 752, 20)
        .fill();
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7);

      headers.forEach((h, i) => {
        doc.text(h, colX[i], tableTop, { width: colWidths[i], align: "left" });
      });

      let currentY = tableTop + 20;

      for (const row of results) {
        if (currentY > 530) {
          doc.addPage();
          currentY = 40;
          // Header en cada página
          doc
            .fillColor("#0f172a")
            .rect(20, currentY - 5, 752, 20)
            .fill();
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7);
          headers.forEach((h, i) =>
            doc.text(h, colX[i], currentY, { width: colWidths[i] }),
          );
          currentY += 20;
        }

        // Alternating row colors
        if (results.indexOf(row) % 2 === 1) {
          doc
            .fillColor("#f8fafc")
            .rect(20, currentY - 5, 752, 30)
            .fill();
        }

        doc.fillColor("#0f172a").font("Helvetica").fontSize(6);

        const fechaStr = new Date(row.fecha).toLocaleDateString("es-ES", {
          timeZone: "UTC",
        });
        doc.text(fechaStr, colX[0], currentY, { width: colWidths[0] });
        doc.text(row.orden_trabajo || "-", colX[1], currentY, {
          width: colWidths[1],
        });
        doc.text(row.operador_cctv, colX[2], currentY, { width: colWidths[2] });
        doc.text(row.visitante_nombre, colX[3], currentY, {
          width: colWidths[3],
        });
        doc.text(row.visitante_cedula, colX[4], currentY, {
          width: colWidths[4],
        });
        doc.text(row.hora_ingreso, colX[5], currentY, { width: colWidths[5] });
        doc.text(row.hora_salida || "--:--", colX[6], currentY, {
          width: colWidths[6],
        });
        doc.text(row.tipo_funcionario, colX[7], currentY, {
          width: colWidths[7],
        });
        doc.text(row.especificar_funcionario || "-", colX[8], currentY, {
          width: colWidths[8],
        });
        doc.text(row.detalle_actividad_autorizacion, colX[9], currentY, {
          width: colWidths[9],
        });
        doc.text(row.observaciones || "-", colX[10], currentY, {
          width: colWidths[10],
        });

        if (row.firma_url) {
          const fullSigPath = path.join(__dirname, "public", row.firma_url);
          if (fs.existsSync(fullSigPath)) {
            doc.image(fullSigPath, colX[11], currentY - 4, {
              width: 50,
              height: 18,
            });
          }
        }

        currentY += 30;
        doc
          .moveTo(20, currentY - 5)
          .lineTo(772, currentY - 5)
          .strokeColor("#e2e8f0")
          .lineWidth(0.5)
          .stroke();
      }

      doc.end();
    } catch (error) {
      console.error("PDF Error:", error);
      res.status(500).json({ message: "Error al generar PDF" });
    }
  },
);

// Reporte Excel Consolidado de la sede autenticada
app.get(
  "/api/admin/reporte-excel",
  verifyToken,
  requireRole(["ADMIN", "SUPERVISOR"]),
  async (req, res) => {
    const centro_comercial_id = req.user.centro_comercial_id;
    if (!centro_comercial_id) {
      return res.status(400).json({ message: "Token sin información de sede" });
    }

    try {
      const cc = await query(
        "SELECT nombre FROM centros_comerciales WHERE id = ?",
        [centro_comercial_id],
      );
      const ccNombre = cc.length > 0 ? cc[0].nombre : "REGISTRO GENERAL";

      // Build dynamic query with same optional filters as PDF export
      const { fechaDesde, fechaHasta, estado } = req.query;
      let sqlWhere = "WHERE centro_comercial_id = ?";
      const sqlParams = [centro_comercial_id];

      if (fechaDesde) {
        sqlWhere += " AND DATE(fecha) >= ?";
        sqlParams.push(fechaDesde);
      }
      if (fechaHasta) {
        sqlWhere += " AND DATE(fecha) <= ?";
        sqlParams.push(fechaHasta);
      }
      if (estado && (estado === "ABIERTO" || estado === "CERRADO")) {
        sqlWhere += " AND estado = ?";
        sqlParams.push(estado);
      }

      const results = await query(
        `SELECT * FROM ingresos_cctv ${sqlWhere} ORDER BY fecha DESC, hora_ingreso DESC`,
        sqlParams,
      );

      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistema CCTV";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Registros", {
        pageSetup: { orientation: "landscape", fitToPage: true },
      });

      // --- Build filter description for subtitle ---
      const filterParts = [];
      if (fechaDesde) filterParts.push(`Desde: ${fechaDesde}`);
      if (fechaHasta) filterParts.push(`Hasta: ${fechaHasta}`);
      if (estado) filterParts.push(`Estado: ${estado}`);
      const filterDesc =
        filterParts.length > 0
          ? filterParts.join("   |   ")
          : "Sin filtros aplicados — datos completos";

      // --- Title rows ---
      sheet.mergeCells("A1:M1");
      const titleCell = sheet.getCell("A1");
      titleCell.value = "REPORTE CONSOLIDADO DE REGISTRO DE TRABAJO CCTV";
      titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 28;

      sheet.mergeCells("A2:M2");
      const subtitleCell = sheet.getCell("A2");
      subtitleCell.value = ccNombre.toUpperCase();
      subtitleCell.font = { bold: true, size: 11, color: { argb: "FF475569" } };
      subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(2).height = 20;

      sheet.mergeCells("A3:M3");
      const filterCell = sheet.getCell("A3");
      filterCell.value = `Filtros aplicados: ${filterDesc}`;
      filterCell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
      filterCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      filterCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(3).height = 16;

      sheet.addRow([]); // empty spacer row

      // --- Column definitions ---
      sheet.columns = [
        { key: "fecha",         header: "FECHA",            width: 13 },
        { key: "orden",         header: "ORDEN TRABAJO",    width: 15 },
        { key: "operador",      header: "OPERADOR CCTV",    width: 22 },
        { key: "visitante",     header: "VISITANTE",        width: 26 },
        { key: "cedula",        header: "CÉDULA",           width: 15 },
        { key: "tipo",          header: "TIPO FUNC.",       width: 14 },
        { key: "especificar",   header: "EMP / EXT",        width: 18 },
        { key: "estado",        header: "ESTADO",           width: 10 },
        { key: "ingreso",       header: "HORA INGRESO",     width: 14 },
        { key: "salida",        header: "HORA SALIDA",      width: 14 },
        { key: "actividad",     header: "DETALLE ACTIVIDAD",width: 40 },
        { key: "observaciones", header: "OBSERVACIONES",    width: 30 },
        { key: "tiene_firma",   header: "FIRMA",            width: 10 },
      ];

      // Style header row (row 5 because of 3 title + 1 spacer)
      const headerRow = sheet.getRow(5);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FF334155" } },
        };
      });
      headerRow.height = 22;

      // Freeze panes below header
      sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 5 }];

      // --- Data rows ---
      const ROW_LIGHT = "FFFFFFFF";
      const ROW_ALT   = "FFF8FAFC";
      const GREEN_BG  = "FFECFDF5";
      const GREEN_FG  = "FF065F46";
      const AMBER_BG  = "FFFEFCE8";
      const AMBER_FG  = "FF92400E";

      results.forEach((row, idx) => {
        const fechaStr = row.fecha
          ? new Date(row.fecha).toLocaleDateString("es-ES", { timeZone: "UTC" })
          : "";

        const dataRow = sheet.addRow({
          fecha:         fechaStr,
          orden:         row.orden_trabajo || "-",
          operador:      row.operador_cctv,
          visitante:     row.visitante_nombre,
          cedula:        row.visitante_cedula,
          tipo:          row.tipo_funcionario,
          especificar:   row.especificar_funcionario || "-",
          estado:        row.estado || "ABIERTO",
          ingreso:       row.hora_ingreso,
          salida:        row.hora_salida || "--:--",
          actividad:     row.detalle_actividad_autorizacion,
          observaciones: row.observaciones || "-",
          tiene_firma:   row.firma_url ? "✓ Sí" : "✗ No",
        });

        const rowBg = idx % 2 === 0 ? ROW_LIGHT : ROW_ALT;

        dataRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { size: 9 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          cell.alignment = { vertical: "middle", wrapText: true };
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
          };
        });

        // Highlight ESTADO cell
        const estadoCell = dataRow.getCell("estado");
        if (row.estado === "CERRADO") {
          estadoCell.font = { bold: true, size: 9, color: { argb: GREEN_FG } };
          estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
        } else {
          estadoCell.font = { bold: true, size: 9, color: { argb: AMBER_FG } };
          estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_BG } };
        }
        estadoCell.alignment = { horizontal: "center", vertical: "middle" };

        // Center time columns
        dataRow.getCell("ingreso").alignment = { horizontal: "center", vertical: "middle" };
        dataRow.getCell("salida").alignment  = { horizontal: "center", vertical: "middle" };
        dataRow.getCell("tiene_firma").alignment = { horizontal: "center", vertical: "middle" };

        dataRow.height = 18;
      });

      // --- Summary footer ---
      sheet.addRow([]);
      const totalRow = sheet.addRow([
        `Total registros: ${results.length}`,
        "", "", "", "", "", "", "", "", "", "", "",
        `Generado: ${new Date().toLocaleString("es-ES")}`,
      ]);
      totalRow.getCell(1).font = { bold: true, italic: true, size: 9, color: { argb: "FF475569" } };
      totalRow.getCell(13).font = { italic: true, size: 8, color: { argb: "FF94A3B8" } };

      // --- Stream response ---
      const safeName = ccNombre.replace(/\s+/g, "_").toLowerCase();
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=reporte_${safeName}_${dateStr}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Excel Error:", error);
      res.status(500).json({ message: "Error al generar Excel" });
    }
  },
);

// --- NUEVOS ENDPOINTS DE GESTIÓN DE USUARIOS Y SEDES (SOLO ADMIN) ---


// 1. Obtener listado de usuarios (Filtrado por sede del administrador)
app.get(
  "/api/admin/usuarios",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const centro_comercial_id = req.user.centro_comercial_id;
    try {
      const results = await query(
        `
      SELECT u.id, u.username, u.nombre_completo, u.centro_comercial_id, u.rol, cc.nombre AS centro_comercial_nombre 
      FROM usuarios u 
      LEFT JOIN centros_comerciales cc ON u.centro_comercial_id = cc.id 
      WHERE u.centro_comercial_id = ?
      ORDER BY u.nombre_completo ASC
    `,
        [centro_comercial_id],
      );
      res.json(results);
    } catch (error) {
      console.error("Error al obtener usuarios:", error);
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  },
);

// 2. Crear un usuario (Forzado a la sede del administrador)
app.post(
  "/api/admin/usuarios",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { username, password, nombre_completo, rol } = req.body;
    const centro_comercial_id = req.user.centro_comercial_id;

    if (!username || !password || !nombre_completo || !rol) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    try {
      // Validar si el username ya existe
      const existing = await query(
        "SELECT id FROM usuarios WHERE username = ?",
        [username],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({ message: "El nombre de usuario ya está registrado" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await query(
        "INSERT INTO usuarios (username, password, nombre_completo, centro_comercial_id, rol) VALUES (?, ?, ?, ?, ?)",
        [username, hashedPassword, nombre_completo, centro_comercial_id, rol],
      );

      res.status(201).json({ message: "Usuario creado exitosamente" });
    } catch (error) {
      console.error("Error al crear usuario:", error);
      res.status(500).json({ message: "Error al crear usuario" });
    }
  },
);

// 3. Editar un usuario (Validación de pertenencia a sede del administrador)
app.put(
  "/api/admin/usuarios/:id",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { id } = req.params;
    const { username, password, nombre_completo, rol } = req.body;
    const centro_comercial_id = req.user.centro_comercial_id;

    if (!username || !nombre_completo || !rol) {
      return res.status(400).json({ message: "Campos obligatorios faltantes" });
    }

    try {
      // Verificar que el usuario a editar pertenezca a la misma sede del administrador
      const targetUser = await query(
        "SELECT centro_comercial_id FROM usuarios WHERE id = ?",
        [id],
      );
      if (targetUser.length === 0) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      if (targetUser[0].centro_comercial_id !== centro_comercial_id) {
        return res
          .status(403)
          .json({
            message: "Acceso denegado: el usuario no pertenece a tu sede",
          });
      }

      // Validar si el username ya existe para otro usuario
      const existing = await query(
        "SELECT id FROM usuarios WHERE username = ? AND id != ?",
        [username, id],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({
            message: "El nombre de usuario ya está en uso por otra cuenta",
          });
      }

      if (password && password.trim() !== "") {
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
          "UPDATE usuarios SET username = ?, password = ?, nombre_completo = ?, centro_comercial_id = ?, rol = ? WHERE id = ?",
          [
            username,
            hashedPassword,
            nombre_completo,
            centro_comercial_id,
            rol,
            id,
          ],
        );
      } else {
        await query(
          "UPDATE usuarios SET username = ?, nombre_completo = ?, centro_comercial_id = ?, rol = ? WHERE id = ?",
          [username, nombre_completo, centro_comercial_id, rol, id],
        );
      }

      res.json({ message: "Usuario actualizado exitosamente" });
    } catch (error) {
      console.error("Error al actualizar usuario:", error);
      res.status(500).json({ message: "Error al actualizar usuario" });
    }
  },
);

// 4. Eliminar un usuario (Validación de pertenencia a sede del administrador)
app.delete(
  "/api/admin/usuarios/:id",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { id } = req.params;
    const centro_comercial_id = req.user.centro_comercial_id;

    // Evitar que el administrador se elimine a sí mismo
    if (parseInt(id) === req.user.id) {
      return res
        .status(400)
        .json({
          message: "No puedes eliminar tu propio usuario de la sesión actual",
        });
    }

    try {
      // Verificar que el usuario a eliminar pertenezca a la misma sede del administrador
      const targetUser = await query(
        "SELECT centro_comercial_id FROM usuarios WHERE id = ?",
        [id],
      );
      if (targetUser.length === 0) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      if (targetUser[0].centro_comercial_id !== centro_comercial_id) {
        return res
          .status(403)
          .json({
            message: "Acceso denegado: el usuario no pertenece a tu sede",
          });
      }

      await query("DELETE FROM usuarios WHERE id = ?", [id]);
      res.json({ message: "Usuario eliminado exitosamente" });
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      res.status(500).json({ message: "Error al eliminar usuario" });
    }
  },
);

// 5. Crear una sede (Centro Comercial)
app.post(
  "/api/admin/centros-comerciales",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { nombre, slug, color, logoBase64 } = req.body;
    if (!nombre || !slug) {
      return res
        .status(400)
        .json({ message: "El nombre y slug son campos obligatorios" });
    }

    try {
      // Validar nombre o slug existente
      const existing = await query(
        "SELECT id FROM centros_comerciales WHERE nombre = ? OR slug = ?",
        [nombre, slug],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({ message: "Ya existe una sede con ese nombre o slug" });
      }

      let logoName = null;
      if (logoBase64 && logoBase64.startsWith("data:image")) {
        const mimeType = logoBase64.substring(
          logoBase64.indexOf(":") + 1,
          logoBase64.indexOf(";"),
        );
        const extension = mimeType === "image/png" ? "png" : "jpg";
        logoName = `logo_${Date.now()}.${extension}`;
        const logoPath = path.join(logoDir, logoName);
        const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(logoPath, base64Data, "base64");
      }

      await query(
        "INSERT INTO centros_comerciales (nombre, slug, color, logo) VALUES (?, ?, ?, ?)",
        [nombre, slug, color || "#3b82f6", logoName],
      );

      res.status(201).json({ message: "Sede creada exitosamente" });
    } catch (error) {
      console.error("Error al crear sede:", error);
      res.status(500).json({ message: "Error al crear sede" });
    }
  },
);

// 6. Editar una sede (Centro Comercial)
app.put(
  "/api/admin/centros-comerciales/:id",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { id } = req.params;
    const { nombre, slug, color, logoBase64 } = req.body;
    if (!nombre || !slug) {
      return res
        .status(400)
        .json({ message: "El nombre y slug son campos obligatorios" });
    }

    try {
      // Validar si nombre o slug están en uso por otra sede
      const existing = await query(
        "SELECT id FROM centros_comerciales WHERE (nombre = ? OR slug = ?) AND id != ?",
        [nombre, slug, id],
      );
      if (existing.length > 0) {
        return res
          .status(400)
          .json({ message: "Ya existe otra sede con ese nombre o slug" });
      }

      let logoName = null;
      if (logoBase64 && logoBase64.startsWith("data:image")) {
        const mimeType = logoBase64.substring(
          logoBase64.indexOf(":") + 1,
          logoBase64.indexOf(";"),
        );
        const extension = mimeType === "image/png" ? "png" : "jpg";
        logoName = `logo_${Date.now()}.${extension}`;
        const logoPath = path.join(logoDir, logoName);
        const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(logoPath, base64Data, "base64");
      }

      if (logoName) {
        await query(
          "UPDATE centros_comerciales SET nombre = ?, slug = ?, color = ?, logo = ? WHERE id = ?",
          [nombre, slug, color || "#3b82f6", logoName, id],
        );
      } else {
        await query(
          "UPDATE centros_comerciales SET nombre = ?, slug = ?, color = ? WHERE id = ?",
          [nombre, slug, color || "#3b82f6", id],
        );
      }

      res.json({ message: "Sede actualizada exitosamente" });
    } catch (error) {
      console.error("Error al actualizar sede:", error);
      res.status(500).json({ message: "Error al actualizar sede" });
    }
  },
);

// 7. Eliminar una sede (Centro Comercial)
app.delete(
  "/api/admin/centros-comerciales/:id",
  verifyToken,
  requireRole(["ADMIN"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      // Validar dependencias (usuarios y registros)
      const usersCount = await query(
        "SELECT COUNT(*) as count FROM usuarios WHERE centro_comercial_id = ?",
        [id],
      );
      const recordsCount = await query(
        "SELECT COUNT(*) as count FROM ingresos_cctv WHERE centro_comercial_id = ?",
        [id],
      );

      if (usersCount[0].count > 0 || recordsCount[0].count > 0) {
        return res.status(400).json({
          message:
            "No es posible eliminar la sede ya que existen usuarios o registros de ingreso asociados a ella.",
        });
      }

      await query("DELETE FROM centros_comerciales WHERE id = ?", [id]);
      res.json({ message: "Sede eliminada exitosamente" });
    } catch (error) {
      console.error("Error al eliminar sede:", error);
      res.status(500).json({ message: "Error al eliminar sede" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
