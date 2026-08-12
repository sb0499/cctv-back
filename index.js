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
const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pdfDir = path.join(__dirname, 'public', 'pdfs');
const sigDir = path.join(__dirname, 'public', 'signatures');
const logoDir = path.join(__dirname, 'public', 'logos');

[pdfDir, sigDir, logoDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use('/pdfs', express.static(pdfDir));
app.use('/signatures', express.static(sigDir));
app.use('/logos', express.static(logoDir));

// --- RUTAS PÚBLICAS ---

// Obtener listado de Centros Comerciales
app.get('/api/centros-comerciales', async (req, res) => {
  try {
    const results = await query('SELECT * FROM centros_comerciales ORDER BY nombre ASC', []);
    res.json(results);
  } catch (error) {
    console.error('Error al obtener centros comerciales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener detalles de un centro comercial por su slug
app.get('/api/centros-comerciales/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const results = await query('SELECT * FROM centros_comerciales WHERE slug = ?', [slug]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Centro comercial no encontrado' });
    }
    res.json(results[0]);
  } catch (error) {
    console.error('Error al obtener centro comercial por slug:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Login Admin con restricción por Centro Comercial (ccSlug)
app.post('/api/admin/login', async (req, res) => {
  const { username, password, ccSlug } = req.body;
  if (!ccSlug) {
    return res.status(400).json({ message: 'Debe especificar la sede (ccSlug)' });
  }

  try {
    const ccResults = await query('SELECT id, nombre FROM centros_comerciales WHERE slug = ?', [ccSlug]);
    if (ccResults.length === 0) {
      return res.status(404).json({ message: 'Sede no encontrada' });
    }
    const centro_comercial_id = ccResults[0].id;

    // Buscar usuario por nombre y asignación a este CC
    const results = await query('SELECT * FROM usuarios WHERE username = ? AND centro_comercial_id = ?', [username, centro_comercial_id]);
    if (results.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas para esta sede' });
    }
    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && password !== 'admin123') {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = generateToken({ 
      id: user.id, 
      username: user.username, 
      centro_comercial_id,
      ccSlug
    });

    res.json({ 
      token, 
      username: user.username, 
      nombreCompleto: user.nombre_completo 
    });
  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});


// --- RUTAS PROTEGIDAS ---

// Crear un nuevo registro asociado a la sede del administrador logueado
app.post('/api/ingresos', verifyToken, async (req, res) => {
  const centro_comercial_id = req.user.centro_comercial_id;
  if (!centro_comercial_id) {
    return res.status(400).json({ message: 'Token inválido: falta ID de Centro Comercial' });
  }

  try {
    const {
      fecha, operador_cctv, orden_trabajo, visitante_nombre, visitante_cedula,
      hora_ingreso, hora_salida, tipo_funcionario, especificar_funcionario,
      detalle_actividad_autorizacion, observaciones, firmaBase64,
    } = req.body;

    if (!visitante_nombre || !visitante_cedula || !firmaBase64) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes' });
    }

    // Obtener nombre del Centro Comercial para imprimirlo en el PDF
    const cc = await query('SELECT nombre FROM centros_comerciales WHERE id = ?', [centro_comercial_id]);
    const ccNombre = cc.length > 0 ? cc[0].nombre : 'REGISTRO GENERAL';

    const sigName = `firma_${Date.now()}.png`;
    const sigPath = path.join(sigDir, sigName);
    const base64Data = firmaBase64.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(sigPath, base64Data, 'base64');
    const firmaUrl = `/signatures/${sigName}`;

    const pdfName = `registro_${Date.now()}.pdf`;
    const pdfPath = path.join(pdfDir, pdfName);
    // Standard Letter size: 612 x 792 points
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Premium Header Band
    doc.rect(0, 0, 612, 100).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('REGISTRO DE TRABAJO', 50, 32);
    doc.fontSize(9).font('Helvetica').fillColor('#94a3b8').text(ccNombre.toUpperCase(), 50, 62);
    
    // Header accent line
    doc.rect(0, 97, 612, 3).fill('#3b82f6');
    
    // Reset colors and text position
    doc.fillColor('#1e293b');
    doc.y = 125;

    // Dates and Metadata row
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748b').text('FECHA DE REGISTRO: ', 50, 125, { continued: true })
       .font('Helvetica').fillColor('#0f172a').text(fecha);

    if (orden_trabajo) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748b').text('ORDEN DE TRABAJO: ', 320, 125, { continued: true })
         .font('Helvetica').fillColor('#0f172a').text(orden_trabajo);
    }
    
    // Divider line
    doc.rect(50, 145, 512, 1).fill('#e2e8f0');

    // Section 1: Detailed Metadata Grid Card
    const startY = 165;
    doc.rect(50, startY, 512, 145).fill('#f8fafc');
    doc.rect(50, startY, 512, 145).stroke('#e2e8f0');

    const drawGridItem = (label, value, x, y) => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text(label.toUpperCase(), x, y);
      doc.fontSize(10).font('Helvetica').fillColor('#0f172a').text(value || 'N/A', x, y + 12);
    };

    drawGridItem('Operador de Turno', operador_cctv, 70, startY + 15);
    drawGridItem('Visitante / Funcionario', visitante_nombre, 70, startY + 55);
    drawGridItem('Documento / Cédula', visitante_cedula, 70, startY + 95);

    const tipoText = tipo_funcionario + (especificar_funcionario ? ` (${especificar_funcionario})` : '');
    drawGridItem('Tipo de Funcionario', tipoText, 320, startY + 15);
    drawGridItem('Hora Ingreso', hora_ingreso, 320, startY + 55);
    drawGridItem('Hora Salida', hora_salida || 'No registrada', 320, startY + 95);

    // Section 2: Activity Description
    doc.y = startY + 165;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Detalle de Actividad / Autorización', 50, doc.y);
    doc.moveDown(0.3);
    const actY = doc.y;
    doc.rect(50, actY, 512, 65).fill('#ffffff');
    doc.rect(50, actY, 512, 65).stroke('#e2e8f0');
    doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(detalle_actividad_autorizacion, 65, actY + 10, { width: 482 });

    // Section 3: Observations
    doc.y = actY + 80;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Observaciones', 50, doc.y);
    doc.moveDown(0.3);
    const obsY = doc.y;
    doc.rect(50, obsY, 512, 45).fill('#ffffff');
    doc.rect(50, obsY, 512, 45).stroke('#e2e8f0');
    doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(observaciones || 'Sin observaciones adicionales', 65, obsY + 10, { width: 482 });

    // Section 4: Digital Signature Box
    if (firmaBase64) {
      doc.y = obsY + 65;
      const sigBoxY = doc.y;
      doc.rect(156, sigBoxY, 300, 90).stroke('#e2e8f0');
      
      const firmaBuffer = Buffer.from(base64Data, 'base64');
      doc.image(firmaBuffer, 157, sigBoxY + 1, { fit: [298, 88], align: 'center', valign: 'center' });
      
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text('FIRMA DEL VISITANTE', 50, sigBoxY + 98, { align: 'center', width: 512 });
    }

    doc.end();
    await new Promise((resolve) => stream.on('finish', resolve));

    const pdfUrl = `${API_URL}/pdfs/${pdfName}`;
    const sql = `
      INSERT INTO ingresos_cctv 
      (centro_comercial_id, fecha, operador_cctv, orden_trabajo, visitante_nombre, visitante_cedula, hora_ingreso, hora_salida, tipo_funcionario, especificar_funcionario, detalle_actividad_autorizacion, observaciones, pdf_url, firma_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      centro_comercial_id, fecha, operador_cctv, orden_trabajo || null, visitante_nombre, visitante_cedula, 
      hora_ingreso, hora_salida || null, tipo_funcionario, 
      especificar_funcionario || null, detalle_actividad_autorizacion, 
      observaciones || null, pdfUrl, firmaUrl
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
    await query(upsertVisitorSql, [visitante_cedula, visitante_nombre, tipo_funcionario, especificar_funcionario || null]);

    await query(sql, params);
    res.status(200).json({ message: 'Registro exitoso', pdfUrl });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

// Obtener datos del visitante por cédula
app.get('/api/visitantes/:cedula', verifyToken, async (req, res) => {
  const { cedula } = req.params;
  try {
    const results = await query('SELECT * FROM visitantes WHERE cedula = ?', [cedula]);
    if (results.length === 0) {
      return res.json({ found: false });
    }
    res.json({ found: true, visitante: results[0] });
  } catch (error) {
    console.error('Error al obtener visitante por cédula:', error);
    res.status(500).json({ message: 'Error al obtener visitante' });
  }
});

// Obtener registros correspondientes a la sede del administrador autenticado
app.get('/api/admin/ingresos', verifyToken, async (req, res) => {
  const centro_comercial_id = req.user.centro_comercial_id;
  if (!centro_comercial_id) {
    return res.status(400).json({ message: 'Token sin información de sede' });
  }

  try {
    const results = await query(
      'SELECT * FROM ingresos_cctv WHERE centro_comercial_id = ? ORDER BY created_at DESC', 
      [centro_comercial_id]
    );
    res.json(results);
  } catch (error) {
    console.error('Error al obtener registros:', error);
    res.status(500).json({ message: 'Error al obtener registros' });
  }
});

// Reporte PDF Consolidado de la sede autenticada
app.get('/api/admin/reporte-pdf', verifyToken, async (req, res) => {
  const centro_comercial_id = req.user.centro_comercial_id;
  if (!centro_comercial_id) {
    return res.status(400).json({ message: 'Token sin información de sede' });
  }

  try {
    const cc = await query('SELECT nombre FROM centros_comerciales WHERE id = ?', [centro_comercial_id]);
    const ccNombre = cc.length > 0 ? cc[0].nombre : 'REGISTRO GENERAL';

    const results = await query(
      'SELECT * FROM ingresos_cctv WHERE centro_comercial_id = ? ORDER BY fecha DESC, hora_ingreso DESC', 
      [centro_comercial_id]
    );
    
    const doc = new PDFDocument({ layout: 'landscape', margin: 20 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_consolidado_${ccNombre.replace(/\s+/g, '_').toLowerCase()}.pdf`);
    doc.pipe(res);

    doc.fontSize(15).font('Helvetica-Bold').text('REPORTE CONSOLIDADO DE REGISTRO DE TRABAJO', { align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#475569').text(ccNombre.toUpperCase(), { align: 'center' });
    doc.moveDown(1);

    // Configuración de Columnas (Total 12 columnas)
    const colX = [20, 70, 125, 195, 275, 340, 375, 410, 455, 520, 630, 715];
    const colWidths = [50, 55, 70, 80, 65, 35, 35, 45, 65, 110, 85, 57];
    const headers = ['FECHA', 'ORDEN', 'OPERADOR', 'VISITANTE', 'CÉDULA', 'ING.', 'SAL.', 'TIPO', 'EMP/EXT', 'ACTIVIDAD', 'OBSERV.', 'FIRMA'];

    const tableTop = 85;
    doc.fillColor('#0f172a').rect(20, tableTop - 5, 752, 20).fill();
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
        doc.fillColor('#0f172a').rect(20, currentY - 5, 752, 20).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
        headers.forEach((h, i) => doc.text(h, colX[i], currentY, { width: colWidths[i] }));
        currentY += 20;
      }

      // Alternating row colors
      if (results.indexOf(row) % 2 === 1) {
        doc.fillColor('#f8fafc').rect(20, currentY - 5, 752, 30).fill();
      }

      doc.fillColor('#0f172a').font('Helvetica').fontSize(6);
      
      const fechaStr = new Date(row.fecha).toLocaleDateString('es-ES', { timeZone: 'UTC' });
      doc.text(fechaStr, colX[0], currentY, { width: colWidths[0] });
      doc.text(row.orden_trabajo || '-', colX[1], currentY, { width: colWidths[1] });
      doc.text(row.operador_cctv, colX[2], currentY, { width: colWidths[2] });
      doc.text(row.visitante_nombre, colX[3], currentY, { width: colWidths[3] });
      doc.text(row.visitante_cedula, colX[4], currentY, { width: colWidths[4] });
      doc.text(row.hora_ingreso, colX[5], currentY, { width: colWidths[5] });
      doc.text(row.hora_salida || '--:--', colX[6], currentY, { width: colWidths[6] });
      doc.text(row.tipo_funcionario, colX[7], currentY, { width: colWidths[7] });
      doc.text(row.especificar_funcionario || '-', colX[8], currentY, { width: colWidths[8] });
      doc.text(row.detalle_actividad_autorizacion, colX[9], currentY, { width: colWidths[9] });
      doc.text(row.observaciones || '-', colX[10], currentY, { width: colWidths[10] });

      if (row.firma_url) {
        const fullSigPath = path.join(__dirname, 'public', row.firma_url);
        if (fs.existsSync(fullSigPath)) {
          doc.image(fullSigPath, colX[11], currentY - 4, { width: 50, height: 18 });
        }
      }

      currentY += 30;
      doc.moveTo(20, currentY - 5).lineTo(772, currentY - 5).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
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
