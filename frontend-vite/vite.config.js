import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readTlsFile(filePath) {
  if (!filePath) return undefined;
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath);
}

function findTlsPair(certDir) {
  if (!fs.existsSync(certDir)) return { keyPath: undefined, certPath: undefined };

  const explicitBase = path.join(certDir, "localhost");
  const explicitPair = {
    keyPath: `${explicitBase}-key.pem`,
    certPath: `${explicitBase}.pem`,
  };

  if (fs.existsSync(explicitPair.keyPath) && fs.existsSync(explicitPair.certPath)) {
    return explicitPair;
  }

  const entries = fs.readdirSync(certDir);
  for (const entry of entries) {
    if (!entry.endsWith("-key.pem")) continue;

    const keyPath = path.join(certDir, entry);
    const certPath = path.join(certDir, entry.replace(/-key\.pem$/i, ".pem"));

    if (fs.existsSync(certPath)) {
      return { keyPath, certPath };
    }
  }

  return { keyPath: undefined, certPath: undefined };
}

// vite.config.js
export default defineConfig(({ mode }) => {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, configDir, "VITE_");
  const certDir = path.resolve(configDir, "certs");
  const detectedPair = findTlsPair(certDir);
  const httpsKeyPath = env.VITE_HTTPS_KEY_FILE || detectedPair.keyPath;
  const httpsCertPath = env.VITE_HTTPS_CERT_FILE || detectedPair.certPath;

  const httpsOptions = {
    key: readTlsFile(httpsKeyPath),
    cert: readTlsFile(httpsCertPath),
  };

  const useHttps = Boolean(httpsOptions.key && httpsOptions.cert);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      https: useHttps ? httpsOptions : undefined,
      host: true,
      proxy: {
        // Forward API calls
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        // Forward Admin panel
        "/admin": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        // Forward Django's static files (important for Admin CSS!)
        "/static": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});