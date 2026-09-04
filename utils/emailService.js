const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Envía un correo electrónico con el reporte PDF adjunto (100% idéntico a SECAM).
 * @param {Array<string>} emails Lista de correos destinatarios.
 * @param {Object} report Datos del reporte.
 * @param {string} empresaNombre Nombre del centro comercial.
 * @param {string} pdfPath Ruta completa del archivo PDF generado.
 */
const sendReportEmail = async (emails, report, empresaNombre, pdfPath) => {
  const enableEmail = process.env.ENABLE_EMAIL === 'true';

  if (!enableEmail) {
    console.log('[EmailService] Envío de correos desactivado por configuración (ENABLE_EMAIL != true).');
    return { success: false, reason: 'disabled' };
  }

  if (!emails || emails.length === 0) {
    console.warn(`[EmailService] No hay destinatarios configurados para enviar reporte #${report.id}.`);
    return { success: false, reason: 'no_recipients' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: parseInt(process.env.SMTP_PORT || '465') === 465,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  const fechaFormateada = new Date(report.created_at || report.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
      <meta charset="UTF-8">
      <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #334155; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .header { background-color: #1e293b; color: #ffffff; padding: 25px; text-align: center; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
          .content { padding: 30px; }
          .summary-box { background-color: #f1f5f9; border-radius: 6px; padding: 20px; margin: 20px 0; border-left: 4px solid #475569; }
          .summary-title { font-weight: bold; margin-bottom: 10px; color: #0f172a; }
          .stat { margin: 5px 0; }
          .stat-value { font-weight: 600; }
          .footer { background-color: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>SICC - Reporte de Estado de Cámaras</h1>
          </div>
          <div class="content">
              <p>Estimado equipo,</p>
              <p>Se ha generado un nuevo reporte de estado de cámaras de seguridad para el centro comercial <strong>${empresaNombre}</strong>.</p>
              
              <div class="summary-box">
                  <div class="summary-title">Resumen del Estado de Cámaras</div>
                  <div class="stat">Total Cámaras Revisadas: <span class="stat-value">${report.total_camaras}</span></div>
                  <div class="stat" style="color: #10b981;">🟢 Cámaras Operativas: <span class="stat-value">${report.operativas}</span></div>
                  <div class="stat" style="color: #ef4444;">🔴 Cámaras No Operativas: <span class="stat-value">${report.no_operativas}</span></div>
              </div>

              <p><strong>Detalles de la Revisión:</strong></p>
              <ul>
                  <li><strong>Responsable:</strong> ${report.responsable_nombre || 'Operador'}</li>
                  <li><strong>Fecha y Hora:</strong> ${fechaFormateada}</li>
              </ul>

              <p>Adjunto a este correo encontrará el archivo PDF oficial con el detalle completo de cada cámara para su revisión.</p>
          </div>
          <div class="footer">
              Este es un correo automático, por favor no responda directamente a este mensaje.
          </div>
      </div>
  </body>
  </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || '"SECAM" <noreply@secam.com>',
    to: emails.join(', '),
    subject: `Reporte Estado de Cámaras - ${empresaNombre}`,
    html: htmlContent,
    attachments: [
      {
        filename: `Reporte_Camaras_${empresaNombre.replace(/\s+/g, '_')}_${report.id}.pdf`,
        path: pdfPath,
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Correo enviado exitosamente. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EmailService] Error al enviar correo:', err);
    return { success: false, error: err.message };
  }
};

module.exports = { sendReportEmail };
