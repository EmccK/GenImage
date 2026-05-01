# GenImage

面向多人私有部署的 OpenAI 图片生成工具。当前仅支持 Docker / VPS 部署：可设置访问账号，API 配置由服务端固定，生成历史和图片保存到 VPS 挂载目录。

## 功能

- 文本生图、参考图编辑、遮罩编辑。
- 支持 `Images API` 与 `Responses API`。
- Docker 内置轻量服务端：登录、同源 API 代理、服务端历史记录。
- 可在部署端写死模型、API Key、尺寸、质量、格式、数量等参数。
- 内置 Prompt 模板入口，也可加载 `awesome-gpt-image-2-prompts`。

## Docker 部署

推荐使用 Docker Compose：

```yaml
services:
  genimage:
    image: ghcr.io/emcck/genimage:latest
    ports:
      - "8080:80"
    volumes:
      - ./genimage-data:/data
    environment:
      APP_USERNAME: "admin"
      APP_PASSWORD: "换成你的管理员密码"
      SERVER_STORAGE: "true"

      API_PROXY_URL: "https://api.openai.com/v1"
      ENABLE_API_PROXY: "true"
      APP_API_KEY: "sk-xxxx"
      APP_API_MODE: "images"
      APP_MODEL: "gpt-image-2"
      APP_CODEX_CLI: "false"
      APP_TIMEOUT: "300"
      LOCK_APP_CONFIG: "true"
      HIDE_SETTINGS: "true"

      LOCK_TASK_PARAMS: "true"
      APP_SIZE: "auto"
      APP_QUALITY: "auto"
      APP_OUTPUT_FORMAT: "png"
      APP_N: "1"

      PROMPT_PRESETS_URL: "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main/README.md"
    restart: unless-stopped
```

启动：

```bash
docker compose up -d
```

访问：`http://你的服务器IP:8080`。首次用 `APP_USERNAME` / `APP_PASSWORD` 登录管理员账号，然后点击右上角“用户管理”添加用户账号。每个用户的历史记录互相隔离，并保存在 `./genimage-data/users/<用户名>`。

## 常用环境变量

| 变量 | 说明 |
| --- | --- |
| `APP_USERNAME` | 首次启动时创建的管理员账号，默认 `admin`。 |
| `APP_PASSWORD` | 首次启动时创建管理员账号的密码；`/data/users.json` 已存在后不会覆盖。 |
| `SERVER_STORAGE` | 设为 `true` 后保存历史记录和图片到 `/data`。 |
| `DATA_DIR` | 数据目录，默认 `/data`；用户信息在 `users.json`，各用户历史在 `users/<用户名>/`。 |
| `API_PROXY_URL` | 实际 OpenAI 兼容 API 地址，默认 `https://api.openai.com/v1`。 |
| `ENABLE_API_PROXY` | 是否启用同源 API 代理；设置 `APP_API_KEY` 后默认启用，也可显式设为 `true`。 |
| `APP_API_KEY` | 服务端持有的 API Key，不下发到浏览器；设置后默认启用同源代理。 |
| `APP_API_MODE` | `images` 或 `responses`。 |
| `APP_MODEL` | 模型名，如 `gpt-image-2`。 |
| `APP_CODEX_CLI` | 是否开启 Codex CLI 兼容模式，设为 `true` 或 `false`。 |
| `APP_TIMEOUT` | 请求超时时间，单位秒，默认 `300`。 |
| `LOCK_APP_CONFIG` | 固定 API URL、Key、模型、接口模式等设置。 |
| `HIDE_SETTINGS` | 隐藏右上角设置按钮。 |
| `LOCK_TASK_PARAMS` | 固定生成参数。 |
| `APP_SIZE` | 尺寸，如 `auto`、`1024x1024`。 |
| `APP_QUALITY` | `auto`、`low`、`medium`、`high`。 |
| `APP_OUTPUT_FORMAT` | `png`、`jpeg`、`webp`。 |
| `APP_N` | 单次生成数量。 |
| `PROMPT_PRESETS_URL` | Prompt 模板 Markdown/JSON 地址。 |
| `PROMPT_PRESETS_FILE` | 容器内 Prompt 模板文件路径。 |


## 用户管理

- 首次启动时，如果 `/data/users.json` 不存在，会用 `APP_USERNAME` / `APP_PASSWORD` 创建一个管理员。
- 管理员登录后，点击右上角“用户管理”按钮，可以新增、编辑、禁用、删除用户，也可以重置用户密码。
- 普通用户只能看到自己的历史记录；管理员可以在首页看到所有用户的历史记录，并可在用户管理里设置可生成次数。
- 删除用户会同时删除该用户的历史记录和图片。
- 为避免锁死，系统不允许禁用、降级或删除当前登录的管理员，也不允许删除最后一个启用状态的管理员。

## 更新

```bash
docker compose pull
docker compose up -d
```

## 本地开发

仅用于开发调试，不作为部署方式：

```bash
npm install
npm run dev
```

验证：

```bash
npm test
npm run build
```

## 许可证

MIT License
