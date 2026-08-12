-- Schema para la base de datos de digitalización CCTV
CREATE DATABASE IF NOT EXISTS cctv_records;
USE cctv_records;

CREATE TABLE IF NOT EXISTS centros_comerciales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#3b82f6',
    logo VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS ingresos_cctv (
    id INT AUTO_INCREMENT PRIMARY KEY,
    centro_comercial_id INT NOT NULL,
    fecha DATE NOT NULL,
    operador_cctv VARCHAR(255) NOT NULL,
    orden_trabajo VARCHAR(255) NULL,
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

CREATE TABLE IF NOT EXISTS visitantes (
    cedula VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    tipo_funcionario ENUM('SMO', 'EPS', 'Proveedor', 'Otros') NOT NULL,
    especificar_funcionario VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    centro_comercial_id INT NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol ENUM('ADMIN', 'OPERADOR', 'SUPERVISOR') NOT NULL DEFAULT 'ADMIN'
);

-- Centros Comerciales por defecto
INSERT IGNORE INTO centros_comerciales (id, nombre, slug, color, logo) VALUES 
(1, 'Scala Shopping', 'scala', '#932A53', 'scala.jpg'),
(2, 'Condado Shopping', 'condado', '#654A94', 'condadoLogo.png'),
(3, 'Pomasqui Plaza', 'pomasqui', '#3C4D78', 'pomasqui.jpg');

-- Usuarios administradores por defecto (contraseñas encriptadas)
INSERT IGNORE INTO usuarios (id, centro_comercial_id, username, password, nombre_completo, rol) VALUES 
(1, 2, 'admin', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Condado', 'ADMIN'),
(2, 1, 'admin_scala', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Scala', 'ADMIN'),
(3, 2, 'admin_condado', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Administrador Condado', 'ADMIN'),
(4, 3, 'admin_pomasqui', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Pomasqui', 'ADMIN'),
(5, 2, 'sbaquero', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Sebastián Baquero', 'ADMIN');
