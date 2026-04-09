
CREATE DATABASE IF NOT EXISTS crew_managment_db;
USE crew_managment_db;

CREATE TABLE IF NOT EXISTS Employees (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL,
    personal_id VARCHAR(20)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role        ENUM('employee','manager') NOT NULL DEFAULT 'employee'
);

CREATE TABLE IF NOT EXISTS Certifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS Employee_Certifications (
    employee_id      INT NOT NULL,
    certification_id INT NOT NULL,
    PRIMARY KEY (employee_id, certification_id),
    FOREIGN KEY (employee_id)      REFERENCES Employees(id)     ON DELETE CASCADE,
    FOREIGN KEY (certification_id) REFERENCES Certifications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Tasks (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    description  TEXT NOT NULL,
    workers_needed INT NOT NULL DEFAULT 1,
    status       ENUM('open','in_progress','done') NOT NULL DEFAULT 'open',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Task_Required_Certifications (
    task_id          INT NOT NULL,
    certification_id INT NOT NULL,
    PRIMARY KEY (task_id, certification_id),
    FOREIGN KEY (task_id)          REFERENCES Tasks(id)         ON DELETE CASCADE,
    FOREIGN KEY (certification_id) REFERENCES Certifications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Task_Assignments (
    task_id     INT NOT NULL,
    employee_id INT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, employee_id),
    FOREIGN KEY (task_id)     REFERENCES Tasks(id)     ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE
);

--  משתמש התחלתי

INSERT IGNORE INTO Employees (full_name, personal_id, password_hash, role)
VALUES ('מנהל ראשי', '00001', '$2b$12$dTB2h.MYaBUNmx5MB4kPzeDDmCeGoBUJbFQ/NH73kFU8jzfU2Ophy', 'manager');