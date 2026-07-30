# 13 - 生产部署与 Nginx 模板

## 目标

本文档解决两个常见目标：

1. 主应用内刷新子应用菜单路径时，仍然先回到主应用，再由 qiankun 挂载子应用。
2. 子应用如需独立访问，必须使用与主应用 `activeRule` 不冲突的独立入口。

## 路径职责

### 主应用业务路由

- `/biz-base`
- `/biz-shujumx`
- `/biz-zhusuoyin`
- `/biz-huanzhe360`
- `/template`
- `/common-biz`

这些路径属于主应用路由空间。

要求：

- 刷新这些路径时，必须返回主应用 `index.html`
- 不能直接 `alias` 到子应用目录

### 子应用静态资源入口

- `/subapps/biz-base/`
- `/subapps/biz-shujumx/`
- `/subapps/biz-zhusuoyin/`
- `/subapps/biz-huanzhe360/`
- `/subapps/template/`
- `/subapps/common-biz/`

这些路径只负责子应用产物分发。

要求：

- 主应用通过这些入口加载子应用 HTML 和静态资源
- 允许在这些路径内做 SPA fallback

## 标准部署模板

适用场景：

- 主应用统一接管登录、菜单、标签页、刷新恢复
- 子应用通过 qiankun 嵌入运行
- 不要求子应用和主应用共用同一条业务路径做独立访问

```nginx
server {
    listen 9090;
    server_name 192.168.1.10;

    root /opt/workspace/ygt-web-deploy/df-web-main-ygt;

    # 子应用 HTML：关闭缓存，避免入口陈旧
    location ^~ /subapps/biz-base/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-base/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location ^~ /subapps/biz-shujumx/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-shujumx/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location ^~ /subapps/biz-zhusuoyin/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-zhusuoyin/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location ^~ /subapps/biz-huanzhe360/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-huanzhe360/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location ^~ /subapps/template/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/template/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location ^~ /subapps/common-biz/index.html {
        alias /opt/workspace/ygt-web-deploy/subapps/common-biz/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 子应用目录：只服务产物，不抢业务路由
    location ^~ /subapps/biz-base/ {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-base/;
        try_files $uri $uri/ /index.html;
    }
    location ^~ /subapps/biz-shujumx/ {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-shujumx/;
        try_files $uri $uri/ /index.html;
    }
    location ^~ /subapps/biz-zhusuoyin/ {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-zhusuoyin/;
        try_files $uri $uri/ /index.html;
    }
    location ^~ /subapps/biz-huanzhe360/ {
        alias /opt/workspace/ygt-web-deploy/subapps/biz-huanzhe360/;
        try_files $uri $uri/ /index.html;
    }
    location ^~ /subapps/template/ {
        alias /opt/workspace/ygt-web-deploy/subapps/template/;
        try_files $uri $uri/ /index.html;
    }
    location ^~ /subapps/common-biz/ {
        alias /opt/workspace/ygt-web-deploy/subapps/common-biz/;
        try_files $uri $uri/ /index.html;
    }

    # 主应用入口：activeRule 刷新必须落回这里
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 主应用静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API 代理
    location /api/ {
        proxy_pass http://192.168.199.41:9001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://192.168.199.41:9001/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## 禁止项

不要再加下面这类规则：

```nginx
location ^~ /biz-base/ {
    alias /opt/workspace/ygt-web-deploy/subapps/biz-base/;
    try_files $uri $uri/ /index.html;
}

location ^~ /template/ {
    alias /opt/workspace/ygt-web-deploy/subapps/template/;
    try_files $uri $uri/ /index.html;
}
```

原因：

- 这些路径是主应用 `activeRule`
- 一旦直出子应用，会抢走主应用刷新入口
- 结果就是刷新后直接进入子应用独立页，或出现 404、双前缀、共享库缺失

## 独立访问模板

如果必须支持“子应用独立访问”，不要复用主应用 `activeRule`。

推荐两种方式：

1. 独立子域名
2. 独立前缀，例如 `/standalone/biz-base/`

示例：

```nginx
location ^~ /standalone/biz-base/ {
    alias /opt/workspace/ygt-web-deploy/subapps/biz-base/;
    try_files $uri $uri/ /index.html;
}
```

对应要求：

- 子应用 router base 必须识别 `/standalone/biz-base/`
- 子应用生产构建不能只依赖主应用 `__SHARED_LIBS__`
- 独立入口和主应用 `activeRule` 必须分开

## 子应用独立访问检查清单

子应用想支持独立访问，至少同时满足以下条件：

1. `src/main.ts` 在非 qiankun 模式下能使用独立入口 base，而不是固定 `/`
2. `vite.config.ts` 生产构建不能把运行时完全 external 到主应用
3. `index.html` 资源路径与实际部署路径一致
4. 如果依赖登录态或主应用上下文，必须有独立模式兜底

## 当前项目的验证结论

- 主应用统一刷新入口：已经通过 Nginx 修正
- `/subapps/...` 继续作为子应用产物入口保留
- 如果后续要做“独立访问”，建议单独规划 `/standalone/...` 或独立域名，不要复用 `activeRule`