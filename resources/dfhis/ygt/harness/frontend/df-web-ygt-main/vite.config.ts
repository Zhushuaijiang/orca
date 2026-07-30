import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import type { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { existsSync, cpSync, mkdirSync, readdirSync } from 'fs';
import { runtimeConfig as devRuntimeConfig } from './config/apps/apps.dev.js';

const viteConfigEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const DEFAULT_API_PROXY_TARGET = viteConfigEnv.VITE_API_PROXY_TARGET
  || devRuntimeConfig.apiProxyTarget
  || 'http://192.168.199.41:9000';
const OAUTH_PROXY_TARGET = viteConfigEnv.VITE_OAUTH_PROXY_TARGET
  || devRuntimeConfig.oauthProxyTarget
  || DEFAULT_API_PROXY_TARGET;
type SubAppApiTarget = string | { target: string; stripServicePrefix?: boolean };

const SUB_APP_API_TARGETS: Record<string, SubAppApiTarget> = devRuntimeConfig.subAppApiTargets ?? {};

const DX_TRIAL_STUB = `
export function showTrialPanel() {}
export function registerTrialPanelComponents() {}
export function isClient() { return false; }
export function registerCustomComponents() {}
export function renderTrialPanel() {}
export default {};
`;

const DX_LICENSE_STUB = `
export function parseLicenseKey() { return { format: 1 }; }
export function isUnsupportedKeyFormat() { return false; }
export function validateLicense() {}
export function peekValidationPerformed() { return true; }
export function setLicenseCheckSkipCondition() {}
export default { validateLicense() {} };
`;

/**
 * 拦截 DevExtreme 许可证校验模块 (trial_panel + license_validation)，
 * 同时处理 Vite 模块解析阶段和 esbuild 预打包阶段。
 */
function dxLicenseStub() {
  const trialRe = /trial_panel(\.client)?(\.js)?$/;
  const licenseRe = /license_validation(\.js)?$/;

  return {
    name: 'dx-license-stub',
    enforce: 'pre' as const,
    resolveId(id: string) {
      const filename = id.split(/[/\\]/).pop() || '';
      if (trialRe.test(filename)) return '\0dx-trial-stub';
      if (licenseRe.test(filename)) return '\0dx-license-stub';
    },
    load(id: string) {
      if (id === '\0dx-trial-stub') return DX_TRIAL_STUB;
      if (id === '\0dx-license-stub') return DX_LICENSE_STUB;
    },
  };
}

/**
 * esbuild 插件：在 Vite 预打包 (optimizeDeps) 阶段拦截 license 模块
 */
function dxLicenseEsbuildPlugin(): import('esbuild').Plugin {
  return {
    name: 'dx-license-esbuild-stub',
    setup(build) {
      build.onResolve({ filter: /trial_panel(\.client)?($|\.)/ }, (args) => ({
        path: args.path,
        namespace: 'dx-stub-trial',
      }));
      build.onResolve({ filter: /license_validation($|\.)/ }, (args) => ({
        path: args.path,
        namespace: 'dx-stub-license',
      }));
      build.onLoad({ filter: /.*/, namespace: 'dx-stub-trial' }, () => ({
        contents: DX_TRIAL_STUB,
        loader: 'js',
      }));
      build.onLoad({ filter: /.*/, namespace: 'dx-stub-license' }, () => ({
        contents: DX_LICENSE_STUB,
        loader: 'js',
      }));
    },
  };
}

/**
 * 构建时将 DevExtreme 主题 CSS + 字体/图标 复制到 dist/dx-themes/
 * 支持运行时动态切换主题
 */
function dxThemeCopy() {
  return {
    name: 'dx-theme-copy',
    closeBundle() {
      const srcDir = resolve(__dirname, 'node_modules/devextreme-dist/css');
      const destDir = resolve(__dirname, 'dist/dx-themes');
      if (!existsSync(srcDir)) return;
      mkdirSync(destDir, { recursive: true });
      // 复制 fonts 和 icons 目录
      for (const dir of ['fonts', 'icons']) {
        const s = resolve(srcDir, dir);
        const d = resolve(destDir, dir);
        if (existsSync(s)) cpSync(s, d, { recursive: true });
      }
      // 复制所有 dx.*.css 文件
      for (const f of readdirSync(srcDir)) {
        if (f.startsWith('dx.') && f.endsWith('.css')) {
          cpSync(resolve(srcDir, f), resolve(destDir, f));
        }
      }
    },
  };
}

function normalizeRoutePath(pathname: string): string {
  const plainPath = pathname.split('?')[0]?.split('#')[0] ?? pathname;
  if (!plainPath || plainPath === '/') return '/';
  return plainPath.replace(/\/+$/, '') || '/';
}

function getSubAppRoutePrefix(appName: string): string {
  const routeKey = appName
    .replace(/^df-web-/, '')
    .replace(/^ygt-/, '')
    .replace(/-ygt(?=-|$)/g, '')
    .replace(/^-+|-+$/g, '');

  return `/${routeKey}`;
}

function getSubAppServicePrefix(appName: string): string {
  const serviceName = appName.replace(/^df-web-/, 'df-');
  return `/${serviceName}/api`;
}

function normalizeSubAppApiTarget(target: SubAppApiTarget): { target: string; stripServicePrefix: boolean } {
  return typeof target === 'string'
    ? { target, stripServicePrefix: false }
    : { target: target.target, stripServicePrefix: target.stripServicePrefix === true };
}

function resolvePrefixedSubAppApi(req: IncomingMessage): { target: string; url: string } | null {
  const { url } = req;
  if (!url) return null;

  for (const [appName, rawTarget] of Object.entries(SUB_APP_API_TARGETS)) {
    const servicePrefix = getSubAppServicePrefix(appName);
    if (url === servicePrefix || url.startsWith(`${servicePrefix}/`) || url.startsWith(`${servicePrefix}?`)) {
      const target = normalizeSubAppApiTarget(rawTarget);
      return {
        target: target.target,
        url: target.stripServicePrefix
          ? url.replace(new RegExp(`^/${appName.replace(/^df-web-/, 'df-')}(?=/api(?:/|$|\\?))`, 'u'), '')
          : url,
      };
    }
  }

  return null;
}

function resolveSubAppNameFromReferer(referer: string | undefined): string {
  if (!referer) return '';

  try {
    const refererUrl = new URL(referer);
    const currentPath = normalizeRoutePath(refererUrl.pathname);
    const matched = Object.keys(SUB_APP_API_TARGETS)
      .sort((left, right) => getSubAppRoutePrefix(right).length - getSubAppRoutePrefix(left).length)
      .find((appName) => {
        const routePrefix = normalizeRoutePath(getSubAppRoutePrefix(appName));
        return currentPath === routePrefix || currentPath.startsWith(`${routePrefix}/`);
      });

    return matched ?? '';
  } catch {
    return '';
  }
}

function resolveApiProxyTarget(req: IncomingMessage): string {
  if (isOAuthPath(req.url)) {
    return OAUTH_PROXY_TARGET;
  }

  const subAppName = resolveSubAppNameFromReferer(req.headers.referer);
  const subAppTarget = SUB_APP_API_TARGETS[subAppName];
  return subAppTarget ? normalizeSubAppApiTarget(subAppTarget).target : DEFAULT_API_PROXY_TARGET;
}

/**
 * 判断请求是否归属认证服务（df-ygt-main），需直连 OAuth 代理通道。
 * /oauth2  — 标准 OAuth2 端点（token、revoke 等）
 */
function isOAuthPath(url: string | undefined): boolean {
  if (!url) return false;
  return url === '/oauth2' || url.startsWith('/oauth2/') || url.startsWith('/oauth2?');
}

function buildProxyHeaders(req: IncomingMessage, targetUrl: URL): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;

    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'host' || normalizedKey === 'connection' || normalizedKey === 'content-length') {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else {
      headers.set(key, value);
    }
  }

  headers.set('host', targetUrl.host);

  if (headers.has('origin')) {
    headers.set('origin', targetUrl.origin);
  }

  applyJwtContextHeaders(headers);

  return headers;
}

function applyJwtContextHeaders(headers: Headers) {
  const authorization = headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return;

  const claims = decodeJwtPayload(token);
  if (!claims) return;

  setHeaderIfMissing(headers, 'UserId', stringClaim(claims.userId) || stringClaim(claims.sub));
  setHeaderIfMissing(headers, 'UserName', stringClaim(claims.userName) || stringClaim(claims.sub));
  setHeaderIfMissing(headers, 'TenantId', stringClaim(claims.tenantId) || '0');
  setHeaderIfMissing(headers, 'ClientId', stringClaim(claims.client_id) || stringClaim(claims.aud));
  setHeaderIfMissing(headers, 'JiGouId', stringClaim(claims.jiGouId) || stringClaim(claims.yiLiaoJgDm));
  setHeaderIfMissing(headers, 'KeShiId', stringClaim(claims.keShiId) || stringClaim(claims.keShiDm));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function setHeaderIfMissing(headers: Headers, key: string, value: string) {
  if (value && !headers.has(key)) {
    headers.set(key, value);
  }
}

function createProxyInit(req: IncomingMessage, targetUrl: URL): RequestInit & { duplex?: 'half' } {
  const method = req.method?.toUpperCase() || 'GET';
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: buildProxyHeaders(req, targetUrl),
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = req as BodyInit;
    init.duplex = 'half';
  }

  return init;
}

function applyProxyResponseHeaders(res: NodeJS.WritableStream & { setHeader(name: string, value: string | string[]): void }, upstream: Response) {
  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    res.setHeader('set-cookie', setCookie);
  }

  upstream.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'set-cookie' || normalizedKey === 'transfer-encoding') {
      return;
    }

    res.setHeader(key, value);
  });
}

function simpleApiGateway() {
  return {
    name: 'simple-api-gateway',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const prefixedSubAppApi = resolvePrefixedSubAppApi(req);
        if (!prefixedSubAppApi && !req.url?.startsWith('/api') && !isOAuthPath(req.url)) {
          next();
          return;
        }

        const target = prefixedSubAppApi?.target || resolveApiProxyTarget(req);
        const targetUrl = new URL(prefixedSubAppApi?.url || req.url || '/', target);

        try {
          const upstream = await fetch(targetUrl, createProxyInit(req, targetUrl));
          applyProxyResponseHeaders(res, upstream);
          res.statusCode = upstream.status;
          res.statusMessage = upstream.statusText;

          if (!upstream.body) {
            res.end();
            return;
          }

          Readable.fromWeb(upstream.body as globalThis.ReadableStream).pipe(res);
        } catch (error) {
          server.config.logger.error(`[simple-api-gateway] ${error instanceof Error ? error.message : String(error)}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          }
          res.end('API gateway proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [dxLicenseStub(), vue(), dxThemeCopy(), simpleApiGateway()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 8000,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [dxLicenseEsbuildPlugin()],
    },
  },
});
