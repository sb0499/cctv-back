-- Schema para la base de datos de digitalización CCTV
CREATE DATABASE IF NOT EXISTS cctv_records;
USE cctv_records;

CREATE TABLE IF NOT EXISTS ingresos_cctv (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    operador_cctv VARCHAR(255) NOT NULL,
    visitante_nombre VARCHAR(255) NOT NULL,
    visitante_cedula VARCHAR(50) NOT NULL,
    hora_ingreso TIME NOT NULL,
    hora_salida TIME NULL,
    tipo_funcionario ENUM('SMO', 'EPS', 'Proveedor', 'Otros') NOT NULL,
    especificar_funcionario VARCHAR(255) NULL,
    detalle_actividad_autorizacion TEXT NOT NULL,
    observaciones TEXT NULL,
    pdf_url VARCHAR(255) NOT NULL,
    firma_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

-- Usuario administrador por defecto (password: admin123)
-- Hash generado con bcrypt para 'admin123'
INSERT IGNORE INTO usuarios (username, password) VALUES ('admin', '$2a$10$6uG1S9Zf/p6L7S5K1z.Heu6v1fJv5X1v1v1v1v1v1v1v1v1v1v1');
