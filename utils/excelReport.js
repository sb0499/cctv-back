const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Genera un reporte de inspección en Excel (.xlsx) 100% idéntico al de SECAM.
 */
const generateReportExcel = async (report, details, empresaNombre, empresaSlug) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SECAM';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Inspección de Cámaras');

    // Estilo de Fuentes y Rellenos
    const titleFont = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    const metaFont = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    const regularFont = { name: 'Arial', size: 9, color: { argb: 'FF0F172A' } };
    const boldFont = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };

    const secondaryFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6366F1' } // Indigo 500
    };

    const lightBgFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' } // Slate 50
    };

    const whiteFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }
    };

    const successFont = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF10B981' } };
    const dangerFont = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFEF4444' } };

    // --- LOGO DEL CENTRO COMERCIAL ---
    let logoFilename = null;
    if (empresaSlug === 'scala') {
        logoFilename = 'logoscala.png';
    } else if (empresaSlug === 'condado') {
        logoFilename = 'logocondado.png';
    } else if (empresaSlug === 'pomasqui') {
        logoFilename = 'logopomasqui.png';
    }

    const logoPath = logoFilename ? path.join(__dirname, '..', 'public', 'logos', logoFilename) : null;
    if (logoPath && fs.existsSync(logoPath)) {
        try {
            const logoImage = workbook.addImage({
                filename: logoPath,
                extension: 'png'
            });
            if (empresaSlug === 'pomasqui') {
                worksheet.addImage(logoImage, {
                    tl: { col: 7.5, row: 1 },
                    ext: { width: 90, height: 42 },
                    editAs: 'oneCell'
                });
            } else {
                worksheet.addImage(logoImage, {
                    tl: { col: 8.2, row: 1 },
                    ext: { width: 42, height: 42 },
                    editAs: 'oneCell'
                });
            }
        } catch (imgErr) {
            console.error('Error al insertar logo en Excel:', imgErr);
        }
    }

    // --- CABECERA ESTILIZADA ---
    worksheet.mergeCells('A1:I1');
    const accentLineCell = worksheet.getCell('A1');
    accentLineCell.fill = secondaryFill;
    worksheet.getRow(1).height = 6;

    worksheet.mergeCells('A2:G2');
    const titleCell = worksheet.getCell('A2');
    titleCell.value = ' SECAM  |  Reporte Técnico de Inspección de Cámaras';
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(2).height = 36;

    worksheet.getRow(3).height = 10;

    // --- METADATOS GENERALES ---
    worksheet.getCell('A4').value = 'Centro Comercial:';
    worksheet.getCell('A4').font = metaFont;
    worksheet.getCell('B4').value = empresaNombre;
    worksheet.getCell('B4').font = regularFont;

    worksheet.getCell('E4').value = 'Fecha de Reporte:';
    worksheet.getCell('E4').font = metaFont;
    const fecha = new Date(report.created_at || report.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
    worksheet.getCell('F4').value = fecha;
    worksheet.getCell('F4').font = regularFont;
    worksheet.getRow(4).height = 18;

    worksheet.getCell('A5').value = 'Responsable:';
    worksheet.getCell('A5').font = metaFont;
    worksheet.getCell('B5').value = report.responsable_nombre || 'Operador';
    worksheet.getCell('B5').font = regularFont;
    worksheet.getRow(5).height = 18;

    worksheet.getRow(6).height = 10;

    // --- MÉTRICAS / RESUMEN KPI ---
    const kpiRow = worksheet.getRow(7);
    kpiRow.height = 24;

    for (let c = 1; c <= 9; c++) {
        const cell = kpiRow.getCell(c);
        cell.fill = lightBgFill;
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
    }

    worksheet.getCell('A7').value = 'TOTAL CÁMARAS:';
    worksheet.getCell('A7').font = metaFont;
    worksheet.getCell('A7').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('B7').value = report.total_camaras;
    worksheet.getCell('B7').font = boldFont;
    worksheet.getCell('B7').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.getCell('D7').value = 'OPERATIVAS (OK):';
    worksheet.getCell('D7').font = { ...metaFont, color: { argb: 'FF10B981' } };
    worksheet.getCell('D7').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('E7').value = report.operativas;
    worksheet.getCell('E7').font = successFont;
    worksheet.getCell('E7').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.getCell('G7').value = 'CON FALLA (X):';
    worksheet.getCell('G7').font = { ...metaFont, color: { argb: 'FFEF4444' } };
    worksheet.getCell('G7').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H7').value = report.no_operativas;
    worksheet.getCell('H7').font = dangerFont;
    worksheet.getCell('H7').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.getRow(8).height = 12;

    // --- Encabezados de Tabla ---
    const headers = [
        'Cámara',
        'Código Interno',
        'Dirección IP',
        'Monitor (Propietario)',
        'Sector',
        'Nivel / Piso',
        'Tipo / Modelo',
        'Estado',
        'Observaciones'
    ];

    const headerRowIdx = 9;
    const headerRow = worksheet.getRow(headerRowIdx);
    headerRow.values = headers;
    headerRow.height = 20;

    headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.font = headerFont;
        cell.fill = secondaryFill;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
    });

    // --- Datos ---
    let currentRowIdx = 10;
    details.forEach((item, idx) => {
        const row = worksheet.getRow(currentRowIdx);
        row.values = [
            item.nombre_camara,
            item.codigo_camara || 'N/A',
            item.ip || 'Sin IP',
            item.propietario_nombre || 'Sin Propietario',
            item.sector_nombre,
            item.nivel_nombre,
            `${item.tipo_nombre} / ${item.modelo_nombre}`,
            item.estado === 1 ? 'Operativa' : 'Falla',
            item.observacion || ''
        ];
        row.height = 18;

        const rowFill = idx % 2 === 0 ? lightBgFill : whiteFill;

        for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
            const cell = row.getCell(colIdx);
            cell.fill = rowFill;
            cell.font = regularFont;
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            if (colIdx === 2 || colIdx === 3 || colIdx === 8) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }

            if (colIdx === 8) {
                cell.font = item.estado === 1 ? successFont : dangerFont;
            }
        }

        currentRowIdx++;
    });

    // Ajustar anchos de columnas
    worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            if (cell.row > 8) {
                const cellLength = cell.value ? cell.value.toString().length : 0;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            }
        });
        column.width = Math.max(maxLength + 4, 14);
    });

    return await workbook.xlsx.writeBuffer();
};

module.exports = {
    generateReportExcel
};
