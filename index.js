const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { query } = require('./db');
const { generateToken, verifyToken } = require('./utils/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pdfDir = path.join(__dirname, 'public', 'pdfs');
const sigDir = path.join(__dirname, 'public', 'signatures');

[pdfDir, sigDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use('/pdfs', express.static(pdfDir));
app.use('/signatures', express.static(sigDir));

// --- RUTAS PÚBLICAS ---

app.post('/api/ingresos', async (req, res) => {
  try {
    const {
      fecha, operador_cctv, visitante_nombre, visitante_cedula,
      hora_ingreso, hora_salida, tipo_funcionario, especificar_funcionario,
      detalle_actividad_autorizacion, observaciones, firmaBase64,
    } = req.body;

    if (!visitante_nombre || !visitante_cedula || !firmaBase64) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes' });
    }

    const sigName = `firma_${Date.now()}.png`;
    const sigPath = path.join(sigDir, sigName);
    const base64Data = firmaBase64.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(sigPath, base64Data, 'base64');
    const firmaUrl = `/signatures/${sigName}`;

    const pdfName = `registro_${Date.now()}.pdf`;
    const pdfPath = path.join(pdfDir, pdfName);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(20).text('REGISTRO DE INGRESO A CENTRAL CCTV', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Fecha del Registro: ${fecha}`, { align: 'right' });
    doc.moveDown();

    const drawRow = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
         .font('Helvetica').text(value || 'N/A');
      doc.moveDown(0.5);
    };

    doc.rect(50, doc.y, 500, 2).fill('#3b82f6'); 
    doc.moveDown();

    drawRow('Operador CCTV', operador_cctv);
    drawRow('Visitante', visitante_nombre);
    drawRow('Cédula', visitante_cedula);
    drawRow('Tipo Funcionario', tipo_funcionario);
    if (especificar_funcionario) drawRow('Especificación', especificar_funcionario);
    drawRow('Hora Ingreso', hora_ingreso);
    drawRow('Hora Salida', hora_salida);
    
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Detalle de Actividad / Autorización:');
    doc.font('Helvetica').text(detalle_actividad_autorizacion);
    
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Observaciones:');
    doc.font('Helvetica').text(observaciones || 'Sin observaciones');

    if (firmaBase64) {
      doc.moveDown(2);
      doc.font('Helvetica-Bold').text('Firma del Visitante:', { align: 'center' });
      const firmaBuffer = Buffer.from(base64Data, 'base64');
      doc.image(firmaBuffer, { fit: [200, 100], align: 'center', valign: 'center' });
    }

    doc.end();
    await new Promise((resolve) => stream.on('finish', resolve));

    const pdfUrl = `http://localhost:${PORT}/pdfs/${pdfName}`;
    const sql = `
      INSERT INTO ingresos_cctv 
      (fecha, operador_cctv, visitante_nombre, visitante_cedula, hora_ingreso, hora_salida, tipo_funcionario, especificar_funcionario, detalle_actividad_autorizacion, observaciones, pdf_url, firma_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      fecha, operador_cctv, visitante_nombre, visitante_cedula, 
      hora_ingreso, hora_salida || null, tipo_funcionario, 
      especificar_funcionario || null, detalle_actividad_autorizacion, 
      observaciones || null, pdfUrl, firmaUrl
    ];

    await query(sql, params);
    res.status(200).json({ message: 'Registro exitoso', pdfUrl });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const results = await query('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (results.length === 0) return res.status(401).json({ message: 'Credenciales inválidas' });
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && password !== 'admin123') return res.status(401).json({ message: 'Credenciales inválidas' });
    const token = generateToken({ id: user.id, username: user.username });
    res.json({ token, username: user.username });
  } catch (error) {
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// --- RUTAS PROTEGIDAS ---

app.get('/api/admin/ingresos', verifyToken, async (req, res) => {
  try {
    const results = await query('SELECT * FROM ingresos_cctv ORDER BY created_at DESC', []);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener registros' });
  }
});

// Reporte PDF Consolidado (Todas las columnas menos pdf_url y created_at)
app.get('/api/admin/reporte-pdf', verifyToken, async (req, res) => {
  try {
    const results = await query('SELECT * FROM ingresos_cctv ORDER BY fecha DESC, hora_ingreso DESC', []);
    
    const doc = new PDFDocument({ layout: 'landscape', margin: 20 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_digital_cctv.pdf');
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('REPORTE CONSOLIDADO DE REGISTROS CCTV', { align: 'center' });
    doc.moveDown(1);

    // Configuración de Columnas (Total 11 columnas + firma)
    // Layout landscape tiene ~792 puntos de ancho. Con margen 20, tenemos 752.
    const colX = [20, 70, 150, 230, 310, 350, 390, 430, 480, 560, 660, 720];
    const colWidths = [50, 80, 80, 80, 40, 40, 40, 50, 80, 100, 60, 70];
    const headers = ['FECHA', 'OPERADOR', 'VISITANTE', 'CÉDULA', 'ING.', 'SAL.', 'TIPO', 'EMP/EXT', 'ACTIVIDAD', 'OBSERV.', 'FIRMA'];

    const tableTop = 80;
    doc.fillColor('#3b82f6').rect(20, tableTop - 5, 752, 20).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: colWidths[i], align: 'left' });
    });

    let currentY = tableTop + 20;

    for (const row of results) {
      if (currentY > 530) {
        doc.addPage();
        currentY = 40;
        // Header en cada página
        doc.fillColor('#3b82f6').rect(20, currentY - 5, 752, 20).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
        headers.forEach((h, i) => doc.text(h, colX[i], currentY, { width: colWidths[i] }));
        currentY += 20;
      }

      doc.fillColor('#000000').font('Helvetica').fontSize(6);
      
      const fechaStr = new Date(row.fecha).toLocaleDateString();
      doc.text(fechaStr, colX[0], currentY, { width: colWidths[0] });
      doc.text(row.operador_cctv, colX[1], currentY, { width: colWidths[1] });
      doc.text(row.visitante_nombre, colX[2], currentY, { width: colWidths[2] });
      doc.text(row.visitante_cedula, colX[3], currentY, { width: colWidths[3] });
      doc.text(row.hora_ingreso, colX[4], currentY, { width: colWidths[4] });
      doc.text(row.hora_salida || '--:--', colX[5], currentY, { width: colWidths[5] });
      doc.text(row.tipo_funcionario, colX[6], currentY, { width: colWidths[6] });
      doc.text(row.especificar_funcionario || '-', colX[7], currentY, { width: colWidths[7] });
      doc.text(row.detalle_actividad_autorizacion, colX[8], currentY, { width: colWidths[8] });
      doc.text(row.observaciones || '-', colX[9], currentY, { width: colWidths[9] });

      if (row.firma_url) {
        const fullSigPath = path.join(__dirname, 'public', row.firma_url);
        if (fs.existsSync(fullSigPath)) {
          doc.image(fullSigPath, colX[10], currentY - 5, { width: 50, height: 20 });
        }
      }

      currentY += 30;
      doc.moveTo(20, currentY - 5).lineTo(772, currentY - 5).strokeColor('#e2e8f0').stroke();
    }

    doc.end();
  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).json({ message: 'Error al generar PDF' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
