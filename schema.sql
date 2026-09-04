-- Schema unificado para la base de datos de digitalización CCTV e Inspección de Cámaras (SECAM)
CREATE DATABASE IF NOT EXISTS cctv_records;
USE cctv_records;

-- ========================================================
-- 1. TABLAS CORE DE SEDES Y BITÁCORA CCTV
-- ========================================================

CREATE TABLE IF NOT EXISTS centros_comerciales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#3b82f6',
    logo VARCHAR(255) NULL
);

-- Alias/Tabla Empresas para mantener 100% la estructura de bd_secam.sql
CREATE TABLE IF NOT EXISTS empresas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    centro_comercial_id INT NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(150) NULL,
    password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    rol ENUM('ADMIN', 'OPERADOR', 'SUPERVISOR') NOT NULL DEFAULT 'ADMIN',
    enviar_email TINYINT(1) DEFAULT 1
);

-- Asegurar columnas para bases de datos existentes creadas previamente
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS enviar_email TINYINT(1) DEFAULT 1;

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

-- ========================================================
-- 2. TABLAS DE CATÁLOGOS TÉCNICOS Y CÁMARAS (100% bd_secam.sql)
-- ========================================================

CREATE TABLE IF NOT EXISTS modelos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_modelos_empresa (empresa_id),
    CONSTRAINT modelos_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS niveles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_niveles_empresa (empresa_id),
    CONSTRAINT niveles_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS propietarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_propietarios_empresa (empresa_id),
    CONSTRAINT propietarios_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sectores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_sectores_empresa (empresa_id),
    CONSTRAINT sectores_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tipos_empresa (empresa_id),
    CONSTRAINT tipos_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camaras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_camara VARCHAR(50) DEFAULT NULL,
    nombre VARCHAR(150) NOT NULL,
    propietario_id INT NOT NULL,
    nivel_id INT NOT NULL,
    sector_id INT NOT NULL,
    tipo_id INT NOT NULL,
    modelo_id INT NOT NULL,
    estado TINYINT(1) DEFAULT 1,
    ip VARCHAR(45) DEFAULT NULL,
    imagen VARCHAR(255) DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    empresa_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_camaras_codigo_empresa (empresa_id, codigo_camara),
    KEY propietario_id (propietario_id),
    KEY nivel_id (nivel_id),
    KEY sector_id (sector_id),
    KEY tipo_id (tipo_id),
    KEY modelo_id (modelo_id),
    KEY idx_camaras_empresa (empresa_id),
    CONSTRAINT camaras_ibfk_1 FOREIGN KEY (propietario_id) REFERENCES propietarios (id),
    CONSTRAINT camaras_ibfk_2 FOREIGN KEY (nivel_id) REFERENCES niveles (id),
    CONSTRAINT camaras_ibfk_3 FOREIGN KEY (sector_id) REFERENCES sectores (id),
    CONSTRAINT camaras_ibfk_4 FOREIGN KEY (tipo_id) REFERENCES tipos (id),
    CONSTRAINT camaras_ibfk_5 FOREIGN KEY (modelo_id) REFERENCES modelos (id),
    CONSTRAINT camaras_ibfk_6 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS historial_camaras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camara_id INT NOT NULL,
    usuario_id INT NOT NULL,
    estado_anterior TINYINT(1) NOT NULL,
    estado_nuevo TINYINT(1) NOT NULL,
    observacion TEXT DEFAULT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY camara_id (camara_id),
    KEY usuario_id (usuario_id),
    CONSTRAINT historial_camaras_ibfk_1 FOREIGN KEY (camara_id) REFERENCES camaras (id) ON DELETE CASCADE,
    CONSTRAINT historial_camaras_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
);

CREATE TABLE IF NOT EXISTS reportes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    empresa_id INT NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable_nombre VARCHAR(200) NOT NULL,
    total_camaras INT NOT NULL,
    operativas INT NOT NULL,
    no_operativas INT NOT NULL,
    pdf_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY usuario_id (usuario_id),
    KEY idx_reportes_empresa (empresa_id),
    CONSTRAINT reportes_ibfk_1 FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    CONSTRAINT reportes_ibfk_2 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reporte_detalle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporte_id INT NOT NULL,
    camara_id INT NOT NULL,
    codigo_camara VARCHAR(50) DEFAULT NULL,
    nombre_camara VARCHAR(150) NOT NULL,
    propietario_nombre VARCHAR(150) NOT NULL,
    sector_nombre VARCHAR(100) NOT NULL,
    nivel_nombre VARCHAR(100) NOT NULL,
    tipo_nombre VARCHAR(100) NOT NULL,
    modelo_nombre VARCHAR(100) NOT NULL,
    estado TINYINT(1) NOT NULL,
    observacion TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY reporte_id (reporte_id),
    KEY camara_id (camara_id),
    CONSTRAINT reporte_detalle_ibfk_1 FOREIGN KEY (reporte_id) REFERENCES reportes (id) ON DELETE CASCADE,
    CONSTRAINT reporte_detalle_ibfk_2 FOREIGN KEY (camara_id) REFERENCES camaras (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT DEFAULT NULL,
    usuario_id INT DEFAULT NULL,
    accion VARCHAR(255) NOT NULL,
    detalles TEXT DEFAULT NULL,
    ip VARCHAR(45) DEFAULT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY empresa_id (empresa_id),
    KEY usuario_id (usuario_id),
    CONSTRAINT logs_sistema_ibfk_1 FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE SET NULL,
    CONSTRAINT logs_sistema_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

-- ========================================================
-- 3. DATOS DE INICIALIZACIÓN POR DEFECTO (BD SECAM)
-- ========================================================

INSERT IGNORE INTO centros_comerciales (id, nombre, slug, color, logo) VALUES 
(1, 'Scala Shopping', 'scala', '#932A53', 'scala.jpg'),
(2, 'Condado Shopping', 'condado', '#654A94', 'condadoLogo.png'),
(3, 'Pomasqui Plaza', 'pomasqui', '#3C4D78', 'pomasqui.jpg'),
(4, 'Centro Comercial Iñaquito', 'cci', '#2b6cb0', 'cci.jpg');

INSERT IGNORE INTO empresas (id, nombre, slug, activo) VALUES 
(1, 'Scala Shopping', 'scala', 1),
(2, 'Condado Shopping', 'condado', 1),
(3, 'Pomasqui Plaza', 'pomasqui', 1),
(4, 'Centro Comercial Iñaquito', 'cci', 1);

INSERT IGNORE INTO usuarios (id, centro_comercial_id, username, email, password, nombre_completo, rol, enviar_email) VALUES 
(1, 2, 'admin', 'admin@condadoshopping.com', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Condado', 'ADMIN', 1),
(2, 1, 'admin_scala', 'admin@scalashopping.com', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Scala', 'ADMIN', 1),
(3, 2, 'admin_condado', 'admin_condado@condadoshopping.com', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Administrador Condado', 'ADMIN', 1),
(4, 3, 'admin_pomasqui', 'admin@pomasquiplaza.com', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Admin Pomasqui', 'ADMIN', 1),
(5, 2, 'sbaquero', 'sbaquero@condadoshopping.com', '$2a$12$9mTdPRWvgPCYA/fIy66.G.PQHOfzlm/Opo.2S/Gr25EtvYwLWGtTS', 'Sebastián Baquero', 'ADMIN', 1);

-- INSERTS DE CATÁLOGOS SECAM
INSERT IGNORE INTO modelos (id, nombre, activo, empresa_id) VALUES 
(1,'BIFOCAL',1,1),(2,'IP',1,1),(3,'HIKVISION',1,1),(4,'OJO DE PEZ',1,1),(5,'DOMO',1,2),(6,'TUBO',1,2),(7,'TURBO HD',1,2),(8,'ANALOGA',1,2),(9,'PTZ',1,2),(10,'PRUEBA',1,3);

INSERT IGNORE INTO niveles (id, nombre, activo, empresa_id) VALUES 
(1,'SUBSUELO 3',1,1),(2,'SUBSUELO 2',1,1),(3,'SUBSUELO 1',1,1),(4,'PLANTA BAJA',1,1),(5,'PLANTA ALTA 1',1,1),(6,'PLANTA ALTA 2',1,1),(7,'TERRAZA',1,1),(8,'PARTE EXTERNA',1,1),(9,'PLANTA ALTA 3',1,1),(10,'NIVEL 1',1,2),(11,'NIVEL 2',1,2),(12,'NIVEL 3',1,2),(13,'NIVEL 4',1,2),(14,'EXTERIORES',1,2),(15,'PARQUEADERO 2',1,2),(16,'PARQUEADERO E3',1,2),(17,'PARQUEADERO 3',1,2),(18,'TALLERES ',1,2),(19,'PARQUEADERO E4',1,2),(20,'PARQUEADERO DESCUBIERTO',1,2),(21,'NIVEL 2 PASILLOS DE SERVICIO',1,2),(22,'NIVEL 3 PASILLOS DE SERVICIO',1,2),(23,'NIVEL 4 PASILLOS DE SERVICIO',1,2),(24,'PASILLOS E4',1,2),(25,'EDIFICIO ADMINISTRATIVO',1,2),(26,'PRUEBA',1,3);

INSERT IGNORE INTO propietarios (id, nombre, activo, empresa_id) VALUES 
(1,'MONITOR 1',1,1),(2,'MONITOR 2',1,1),(3,'MONITOR 3',1,1),(4,'MONITOR 4',1,1),(5,'MONITOR 5',1,1),(6,'MONITOR 6',1,1),(7,'MONITOR 7',1,1),(8,'MONITOR 8',1,1),(9,'MONITOR 9',1,1),(10,'MONITOR 10',1,1),(11,'MONITOR 11',1,1),(12,'MONITOR 12',1,1),(13,'NVR 1',1,1),(14,'NVR 2',1,1),(15,'NVR 3',1,1),(16,'NVR 4',1,1),(17,'NVR 5',1,1),(18,'NVR-PLACAS',1,1),(19,'NVR FACIALES',1,1),(20,'MONITOR 13',1,1),(21,'MONITOR 14',1,1),(22,'MONITOR 15',1,1),(23,'MONITOR 1',1,2),(24,'MONITOR 2',1,2),(25,'MONITOR 3',1,2),(26,'MONITOR 4',1,2),(27,'MONITOR 5',1,2),(28,'MONITOR 6',1,2),(29,'MONITOR 7',1,2),(30,'MONITOR 8',1,2),(31,'MONITOR 9',1,2),(32,'MONITOR 10',1,2),(33,'MONITOR 11',1,2),(34,'MONITOR 12',1,2),(35,'MONITOR 15',1,2),(36,'MONITOR 16',1,2),(37,'MONITOR 14',1,2),(38,'SIN MONITOR',1,2),(39,'PRUEBA',1,3);

INSERT IGNORE INTO sectores (id, nombre, activo, empresa_id) VALUES 
(1,'PUNTO ROJO',1,1),(2,'PUNTO AMARILLO',1,1),(3,'ADMINISTRACION',1,1),(4,'SEGURIDAD',1,1),(5,'PUNTO AZUL',1,1),(6,'PUNTO VERDE',1,1),(7,'PUNTO NARANJA',1,1),(8,'BEBE MUNDO',1,1),(9,'BAÑO ETAFASHION',1,1),(10,'TERRAZA',1,1),(11,'INGRESO PRINCIPAL',1,1),(12,'PLAZA CENTRAL',1,1),(13,'CCTV',1,1),(14,'BRAVO 1',1,1),(15,'BRAVO 2',1,1),(16,'BODEGA MANTENIMIENTO',1,1),(17,'MEGAMAXI',1,1),(18,'COMEDOR SEGURIDAD',1,1),(19,'PUNTO BLANCO',1,1),(20,'PANORAMICO',1,1),(21,'GENERADORES',1,1),(23,'BODEGA MARKETING',1,1),(24,' CHAQUIÑAN',1,1),(25,'BRAVO 3',1,1),(26,'BRAVO 4',1,1),(27,'HOSP. VALLES',1,1),(28,'ALFA 1',1,1),(29,'ALFA 2',1,1),(30,'ALFA 3',1,1),(31,'ALFA 4',1,1),(32,'BRAVO 5',1,1),(33,'ALFA 6',1,1),(34,'ALFA 7',1,1),(35,'ALFA 8',1,1),(36,'BRAVO 6',1,1),(37,'ALFA 9',1,1),(38,'ALFA 10 PATIO',1,1),(39,'ALFA 10',1,1),(40,'H VALLES',1,1),(41,'CUCHARA',1,1),(42,'CENTRO CUCHARA',1,1),(43,'CENTRO H VALLES',1,1),(44,'ALFA 12',1,2),(45,'ALFA 9',1,2),(46,'ALFA 14',1,2),(47,'ALFA 2',1,2),(48,'ALFA 6 ',1,2),(49,'ALFA 7',1,2),(50,'ALFA 15',1,2),(51,'ALFA 16',1,2),(52,'ALFA 10',1,2),(53,'ALFA 12',1,2),(54,'ALFA 1',1,2),(55,'ALFA 19',1,2),(56,'ALFA 13',1,2),(57,'VENUS',1,2),(58,'ALFA 11',1,2),(59,'ALFA 20',1,2),(60,'ALFA21',1,2),(61,'ALFA 4',1,2),(62,'ALFA 5',1,2),(63,'PARQUEADERO ADMINISTRATIVO ALFA  8',1,2),(64,'EXTERIORES AV. MARISCAL SUCRE - ALFA 3',1,2),(65,'JC LINCE ',1,2),(66,'LINCE  1',1,2),(67,'LINCE 2',1,2),(68,'LINCE  3',1,2),(69,'ADMINISTRACION ',1,2),(70,'RECEP. MARKETING ',1,2),(71,'INGRESO TALLERES ALFA 17',1,2),(72,'TALLERES ',1,2),(73,'INGRESO Y SALIDA VEHICULAR NIVEL 3-ALFA 18',1,2),(74,'ALFA 8',1,2),(75,'AGUILA',1,2),(76,'GOLFO',1,2),(77,'PRUEBA 2',1,3);

INSERT IGNORE INTO tipos (id, nombre, activo, empresa_id) VALUES 
(1,'DOMO',1,1),(2,'TUBO',1,1),(3,'PTZ',1,1),(4,'LECTORA PLACAS',1,1),(5,'FACIAL',1,1),(6,'OJO DE PEZ',1,1),(7,'IP',1,2),(8,'DOMO',1,2),(9,'TUBO',1,2),(10,'TURBO HD',1,2),(11,'ANALOGA',1,2),(12,'PTZ',1,2),(13,'PRUEBA',1,3);

-- INSERTS DE CÁMARAS SECAM
INSERT IGNORE INTO camaras (id, codigo_camara, nombre, propietario_id, nivel_id, sector_id, tipo_id, modelo_id, estado, ip, imagen, observaciones, empresa_id) VALUES 
(7,'3652','Camara Prueba Condado',24,14,52,8,5,1,'192.168.1.125','0615ead1-c245-4dea-becd-3172b556bac9.png','Observaciones',2),
(13,'CAM-SCL-001','Cámara Zona 001',1,1,1,1,1,0,NULL,NULL,NULL,1),
(14,'CAM-SCL-002','Cámara Zona 002',2,2,2,2,2,1,NULL,NULL,NULL,1),
(15,'CAM-SCL-003','Cámara Zona 003',3,3,3,3,3,1,NULL,NULL,NULL,1),
(16,'CAM-SCL-004','Cámara Zona 004',4,4,4,1,1,1,NULL,NULL,NULL,1),
(17,'CAM-SCL-005','Cámara Zona 005',5,1,1,2,2,1,NULL,NULL,NULL,1),
(18,'CAM-SCL-006','Cámara Zona 006',6,2,2,3,3,0,NULL,NULL,NULL,1),
(19,'CAM-SCL-007','Cámara Zona 007',7,3,3,1,1,1,NULL,NULL,NULL,1),
(20,'CAM-SCL-008','Cámara Zona 008',8,4,4,2,2,1,NULL,NULL,NULL,1),
(21,'CAM-SCL-009','Cámara Zona 009',9,1,1,3,3,1,NULL,NULL,NULL,1),
(22,'CAM-SCL-010','Cámara Zona 010',10,2,2,1,1,1,NULL,NULL,NULL,1),
(23,'CAM-SCL-011','Cámara Zona 011',1,3,3,2,2,1,NULL,NULL,NULL,1),
(24,'CAM-SCL-012','Cámara Zona 012',2,4,4,3,3,0,NULL,NULL,NULL,1),
(25,'CAM-SCL-013','Cámara Zona 013',3,1,1,1,1,1,NULL,NULL,NULL,1),
(26,'CAM-SCL-014','Cámara Zona 014',4,2,2,2,2,1,NULL,NULL,NULL,1),
(27,'CAM-SCL-015','Cámara Zona 015',5,3,3,3,3,1,NULL,NULL,NULL,1),
(28,'CAM-SCL-016','Cámara Zona 016',6,4,4,1,1,1,NULL,NULL,NULL,1),
(29,'CAM-SCL-017','Cámara Zona 017',7,1,1,2,2,1,NULL,NULL,NULL,1),
(30,'CAM-SCL-018','Cámara Zona 018',8,2,2,3,3,0,NULL,NULL,NULL,1),
(31,'CAM-SCL-019','Cámara Zona 019',9,3,3,1,1,1,NULL,NULL,NULL,1),
(32,'CAM-SCL-020','Cámara Zona 020',10,4,4,2,2,1,NULL,NULL,NULL,1),
(33,'CAM-SCL-021','Cámara Zona 021',1,1,1,3,3,1,NULL,NULL,NULL,1),
(34,'CAM-SCL-022','Cámara Zona 022',2,2,2,1,1,1,NULL,NULL,NULL,1),
(35,'CAM-SCL-023','Cámara Zona 023',3,3,3,2,2,1,NULL,NULL,NULL,1),
(36,'CAM-SCL-024','Cámara Zona 024',4,4,4,3,3,0,NULL,NULL,NULL,1),
(37,'CAM-SCL-025','Cámara Zona 025',5,1,1,1,1,1,NULL,NULL,NULL,1),
(38,'CAM-SCL-026','Cámara Zona 026',6,2,2,2,2,1,NULL,NULL,NULL,1),
(39,'CAM-SCL-027','Cámara Zona 027',7,3,3,3,3,1,NULL,NULL,NULL,1),
(40,'CAM-SCL-028','Cámara Zona 028',8,4,4,1,1,1,NULL,NULL,NULL,1),
(41,'CAM-SCL-029','Cámara Zona 029',9,1,1,2,2,1,NULL,NULL,NULL,1),
(42,'CAM-SCL-030','Cámara Zona 030',10,2,2,3,3,0,NULL,NULL,NULL,1),
(43,'CAM-12545','CAMARA PRUEBA',4,8,24,1,1,1,'192.168.10.125','dcf38d0b-8454-4951-b931-eac4759e0f31.jpg','NINGUNA OBSERVACION TODO EN ORDEN',1),
(44,'ASDA222','Camara Prueba POMASQUI',39,26,77,13,10,1,'192.36.11.22','4e15bd5e-ecfb-492c-9379-5b9b24ce137d.jpg','SIN OBSERVACIONES',3);
