-- Inicialização de bancos de dados para OpenWA + n8n
-- Executado automaticamente pelo PostgreSQL no primeiro boot

-- Database para OpenWA
CREATE DATABASE openwa;
CREATE USER openwa WITH ENCRYPTED PASSWORD 'openwa_secure_2026';
GRANT ALL PRIVILEGES ON DATABASE openwa TO openwa;

-- Database para n8n
CREATE DATABASE n8n;
CREATE USER n8n WITH ENCRYPTED PASSWORD 'n8n_secure_2026';
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;

-- Conectar ao database openwa para criar extensões
\c openwa;
ALTER SCHEMA public OWNER TO openwa;
GRANT ALL ON SCHEMA public TO openwa;

-- Conectar ao database n8n para criar extensões
\c n8n;
ALTER SCHEMA public OWNER TO n8n;
GRANT ALL ON SCHEMA public TO n8n;

-- Voltar ao postgres
\c postgres;
