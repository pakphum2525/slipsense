'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8'
};

function resolveSafeFilePath(requestPathname) {
  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(requestPathname || '/');
  } catch (_err) {
    return null;
  }

  const normalizedRel = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const fullPath = path.resolve(PROJECT_ROOT, normalizedRel);

  const relative = path.relative(PROJECT_ROOT, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return fullPath;
}

function createServer(options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : PROJECT_ROOT;

  return http.createServer((req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end('405 Method Not Allowed');
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname || '/');
    } catch (_err) {
      res.writeHead(400, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end('400 Bad Request');
      return;
    }

    const normalizedRel = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const candidatePath = path.resolve(rootDir, normalizedRel);
    const relative = path.relative(rootDir, candidatePath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(candidatePath, (statErr, stats) => {
      let targetFile = candidatePath;
      if (!statErr && stats.isDirectory()) {
        targetFile = path.join(candidatePath, 'index.html');
      }

      fs.readFile(targetFile, (readErr, data) => {
        if (readErr) {
          const status = readErr.code === 'ENOENT' ? 404 : 500;
          res.writeHead(status, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          res.end(status === 404 ? '404 Not Found' : '500 Internal Server Error');
          return;
        }

        const ext = path.extname(targetFile).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });

        if (method === 'HEAD') {
          res.end();
          return;
        }
        res.end(data);
      });
    });
  });
}

if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8080);
  const server = createServer();

  server.listen(port, host, () => {
    console.log(`[SlipSense Dev Server] Serving ${PROJECT_ROOT} at http://${host}:${port}`);
  });
}

module.exports = {
  createServer,
  resolveSafeFilePath,
  MIME_TYPES
};
