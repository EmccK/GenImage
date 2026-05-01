import { createServer } from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = resolve(process.env.STATIC_DIR || join(__dirname, '../dist'))
const DATA_DIR = resolve(process.env.DATA_DIR || '/data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const USERS_DIR = join(DATA_DIR, 'users')
const LEGACY_TASKS_FILE = join(DATA_DIR, 'tasks.json')
const LEGACY_IMAGES_DIR = join(DATA_DIR, 'images')
const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 80)

const INITIAL_ADMIN_PASSWORD = process.env.APP_PASSWORD || process.env.PASSWORD || ''
const INITIAL_ADMIN_USERNAME = process.env.APP_USERNAME || 'admin'
const SESSION_SECRET = process.env.SESSION_SECRET || INITIAL_ADMIN_PASSWORD || randomBytes(32).toString('hex')
const COOKIE_NAME = 'genimage_session'
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE || 60 * 60 * 24 * 30)
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 700 * 1024 * 1024)
const DEFAULT_PROMPT_SOURCE = 'https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(input)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const v1Index = pathSegments.indexOf('v1')
    const normalizedSegments = v1Index >= 0
      ? pathSegments.slice(0, v1Index + 1)
      : pathSegments.length
        ? [...pathSegments, 'v1']
        : []
    const pathname = normalizedSegments.length ? `/${normalizedSegments.join('/')}` : ''
    return `${url.origin}${pathname}`
  } catch {
    return trimmed
  }
}

function getDefaultApiUrl() {
  return normalizeBaseUrl(env('DEFAULT_API_URL') || env('API_PROXY_URL') || 'https://api.openai.com/v1')
}

function getProxyTarget() {
  return normalizeBaseUrl(env('API_PROXY_URL') || env('DEFAULT_API_URL') || 'https://api.openai.com/v1')
}

function isProxyEnabled() {
  return boolEnv('ENABLE_API_PROXY', Boolean(env('APP_API_KEY'))) && Boolean(getProxyTarget())
}

function hasTaskParamEnv() {
  return ['APP_SIZE', 'APP_QUALITY', 'APP_OUTPUT_FORMAT', 'APP_OUTPUT_COMPRESSION', 'APP_MODERATION', 'APP_N'].some((name) => process.env[name] != null)
}

function isLockSettingsEnabled() {
  return boolEnv('LOCK_APP_CONFIG', Boolean(env('APP_API_KEY') || env('APP_MODEL') || env('APP_API_MODE') || env('APP_CODEX_CLI')))
}

function isLockParamsEnabled() {
  return boolEnv('LOCK_TASK_PARAMS', hasTaskParamEnv())
}

function buildLockedSettings() {
  const apiMode = env('APP_API_MODE', 'images') === 'responses' ? 'responses' : 'images'
  const modelFallback = apiMode === 'responses' ? 'gpt-5.5' : 'gpt-image-2'
  return {
    baseUrl: getDefaultApiUrl(),
    apiKey: env('APP_API_KEY') ? 'server-managed-api-key' : env('DEFAULT_API_KEY'),
    model: env('APP_MODEL', modelFallback),
    timeout: numberEnv('APP_TIMEOUT', 300),
    apiMode,
    codexCli: boolEnv('APP_CODEX_CLI'),
    apiProxy: isProxyEnabled(),
  }
}

function buildDefaultSettings() {
  const settings = buildLockedSettings()
  if (!env('APP_API_KEY') && !env('DEFAULT_API_KEY')) {
    delete settings.apiKey
  }
  return settings
}

function buildLockedParams() {
  const outputCompression = env('APP_OUTPUT_COMPRESSION')
  return {
    size: env('APP_SIZE', 'auto'),
    quality: ['low', 'medium', 'high'].includes(env('APP_QUALITY')) ? env('APP_QUALITY') : 'auto',
    output_format: ['jpeg', 'webp'].includes(env('APP_OUTPUT_FORMAT')) ? env('APP_OUTPUT_FORMAT') : 'png',
    output_compression: outputCompression === '' ? null : numberEnv('APP_OUTPUT_COMPRESSION', null),
    moderation: env('APP_MODERATION') === 'low' ? 'low' : 'auto',
    n: Math.max(1, numberEnv('APP_N', 1)),
  }
}

function json(res, statusCode, data, headers = {}) {
  const body = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(body)
}

function text(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(body)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonFile(file, data) {
  await mkdir(dirname(file), { recursive: true }).catch(() => {})
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempFile, JSON.stringify(data, null, 2))
  await rename(tempFile, file)
}

async function readBody(req, limit = MAX_JSON_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, '请求体过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody(req) {
  const body = await readBody(req)
  if (!body.length) return {}
  try {
    return JSON.parse(body.toString('utf-8'))
  } catch {
    throw new HttpError(400, 'JSON 格式无效')
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  return Object.fromEntries(header.split(';').map((part) => {
    const idx = part.indexOf('=')
    if (idx < 0) return ['', '']
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())]
  }).filter(([key]) => key))
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && timingSafeEqual(left, right)
}

function safeEqualBuffer(a, b) {
  return a.length === b.length && timingSafeEqual(a, b)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 32).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  try {
    const actual = scryptSync(String(password), salt, 32)
    const expected = Buffer.from(expectedHex, 'hex')
    return safeEqualBuffer(actual, expected)
  } catch {
    return false
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function isValidUsername(username) {
  return /^[a-z0-9][a-z0-9._-]{1,63}$/.test(username)
}

function assertValidUsername(username) {
  if (!isValidUsername(username)) {
    throw new HttpError(400, '用户名只能包含小写字母、数字、点、下划线和短横线，长度 2-64 位，并且必须以字母或数字开头')
  }
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user'
}

function normalizeGenerationLimit(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, '生成次数必须为空或非负整数')
  return Math.floor(n)
}

function generationLimitOf(user) {
  const n = Number(user?.generationLimit)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function generationUsedOf(user) {
  const n = Number(user?.generationUsed)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function userDataDir(username) {
  return join(USERS_DIR, username)
}

function userTasksFile(username) {
  return join(userDataDir(username), 'tasks.json')
}

function userImagesDir(username) {
  return join(userDataDir(username), 'images')
}

async function ensureUserDataDir(username) {
  assertValidUsername(username)
  await mkdir(userImagesDir(username), { recursive: true })
  if (!(await exists(userTasksFile(username)))) {
    await writeJsonFile(userTasksFile(username), [])
  }
}

function publicUser(user, extra = {}) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role === 'admin' ? 'admin' : 'user',
    disabled: Boolean(user.disabled),
    generationLimit: generationLimitOf(user),
    generationUsed: generationUsedOf(user),
    createdAt: user.createdAt || 0,
    updatedAt: user.updatedAt || user.createdAt || 0,
    ...extra,
  }
}

async function readUsers() {
  const users = await readJsonFile(USERS_FILE, [])
  return Array.isArray(users) ? users : []
}

async function writeUsers(users) {
  await writeJsonFile(USERS_FILE, users)
}

function countEnabledAdmins(users) {
  return users.filter((user) => user.role === 'admin' && !user.disabled).length
}

let userQueue = Promise.resolve()
function mutateUsers(fn) {
  const run = userQueue.then(async () => {
    const users = await readUsers()
    const result = await fn(users)
    await writeUsers(users)
    return result
  })
  userQueue = run.catch(() => {})
  return run
}

async function findUser(username) {
  const normalized = normalizeUsername(username)
  const users = await readUsers()
  return users.find((user) => user.username === normalized) || null
}

async function isAuthEnabled() {
  const users = await readUsers()
  return users.length > 0
}

async function migrateLegacyStorageToUser(username) {
  assertValidUsername(username)
  const hadUserTasks = await exists(userTasksFile(username))
  const hadUserImages = await exists(userImagesDir(username))
  await mkdir(userDataDir(username), { recursive: true })

  if ((await exists(LEGACY_TASKS_FILE)) && !hadUserTasks) {
    const tasks = await readJsonFile(LEGACY_TASKS_FILE, [])
    await writeJsonFile(userTasksFile(username), Array.isArray(tasks) ? tasks : [])
  } else if (!hadUserTasks) {
    await writeJsonFile(userTasksFile(username), [])
  }

  if ((await exists(LEGACY_IMAGES_DIR)) && !hadUserImages) {
    await cp(LEGACY_IMAGES_DIR, userImagesDir(username), { recursive: true, force: false }).catch(() => {})
  } else if (!hadUserImages) {
    await mkdir(userImagesDir(username), { recursive: true })
  }
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(USERS_DIR, { recursive: true })

  let users = await readJsonFile(USERS_FILE, null)
  if (!Array.isArray(users)) users = []

  if (!users.length && INITIAL_ADMIN_PASSWORD) {
    const username = normalizeUsername(INITIAL_ADMIN_USERNAME || 'admin')
    assertValidUsername(username)
    const now = Date.now()
    users.push({
      username,
      displayName: env('APP_DISPLAY_NAME', '管理员'),
      role: 'admin',
      disabled: false,
      passwordHash: hashPassword(INITIAL_ADMIN_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    await writeUsers(users)
    await migrateLegacyStorageToUser(username)
    return
  }

  await writeUsers(users)
  for (const user of users) {
    if (isValidUsername(user.username)) await ensureUserDataDir(user.username)
  }
}

function signSession(username, expires) {
  return createHmac('sha256', SESSION_SECRET).update(`${username}.${expires}`).digest('hex')
}

function makeSessionCookie(username) {
  const expires = Date.now() + SESSION_MAX_AGE * 1000
  const value = `${encodeURIComponent(username)}|${expires}|${signSession(username, expires)}`
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
}

async function getBasicAuthUser(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Basic ')) return null
  try {
    const raw = Buffer.from(header.slice(6), 'base64').toString('utf-8')
    const idx = raw.indexOf(':')
    const username = normalizeUsername(idx >= 0 ? raw.slice(0, idx) : '')
    const password = idx >= 0 ? raw.slice(idx + 1) : raw
    const user = await findUser(username)
    if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) return null
    return user
  } catch {
    return null
  }
}

async function getCookieAuthUser(req) {
  const value = parseCookies(req)[COOKIE_NAME]
  if (!value) return null
  const parts = value.split('|')
  if (parts.length !== 3) return null
  const username = normalizeUsername(decodeURIComponent(parts[0]))
  const expires = Number(parts[1])
  const sig = parts[2]
  if (!Number.isFinite(expires) || expires < Date.now()) return null
  if (!safeEqualString(sig, signSession(username, expires))) return null

  const user = await findUser(username)
  if (!user || user.disabled) return null
  return user
}

async function getAuthUser(req) {
  return (await getBasicAuthUser(req)) || (await getCookieAuthUser(req))
}

function sanitizeId(id) {
  const clean = String(id || '').trim()
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) return ''
  return clean
}

const taskQueues = new Map()
function mutateTasks(username, fn) {
  const prev = taskQueues.get(username) || Promise.resolve()
  const run = prev.then(async () => {
    await ensureUserDataDir(username)
    const file = userTasksFile(username)
    const tasks = await readJsonFile(file, [])
    const list = Array.isArray(tasks) ? tasks : []
    const result = await fn(list)
    await writeJsonFile(file, list)
    return result
  })
  taskQueues.set(username, run.catch(() => {}))
  return run
}

function normalizePromptPreset(value, index, source = DEFAULT_PROMPT_SOURCE) {
  if (!value || typeof value !== 'object') return null
  const prompt = String(value.prompt || '').trim()
  if (!prompt) return null
  const title = String(value.title || `Prompt ${index + 1}`).trim()
  const category = String(value.category || '通用').trim()
  const imageUrl = value.imageUrl || value.image || value.previewImage || value.thumbnail
  return {
    id: String(value.id || `${category}-${title}-${index}`).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-'),
    title,
    category,
    description: value.description ? String(value.description) : undefined,
    source: value.source ? String(value.source) : source,
    imageUrl: imageUrl ? String(imageUrl) : undefined,
    prompt,
    tags: Array.isArray(value.tags) ? value.tags.filter((item) => typeof item === 'string') : undefined,
  }
}

function stripMarkdownTitle(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[#*_`]/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
}

function resolvePromptImageUrl(imageUrl, source) {
  const clean = String(imageUrl || '').trim()
  if (!clean || clean.startsWith('data:')) return clean
  try {
    return new URL(clean, source || DEFAULT_PROMPT_SOURCE).toString()
  } catch {
    return clean
  }
}

function findMarkdownImageUrl(lines, start, end, source) {
  for (let i = start; i < end; i++) {
    const markdownImage = lines[i].match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
    if (markdownImage?.[1]) return resolvePromptImageUrl(markdownImage[1], source)

    const htmlImage = lines[i].match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)
    if (htmlImage?.[1]) return resolvePromptImageUrl(htmlImage[1], source)
  }
  return undefined
}

function parseMarkdownPrompts(markdown, source) {
  const lines = String(markdown || '').split(/\r?\n/)
  const presets = []
  let category = 'awesome-gpt-image-2-prompts'
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^##\s+(.+)/)
    if (h2) category = stripMarkdownTitle(h2[1]) || category

    const h3 = lines[i].match(/^###\s+(.+)/)
    if (!h3) continue
    const title = stripMarkdownTitle(h3[1]) || `Prompt ${presets.length + 1}`
    let prompt = ''
    const blockEnd = lines.findIndex((line, idx) => idx > i && /^###\s+/.test(line))
    const searchEnd = blockEnd < 0 ? Math.min(lines.length, i + 80) : Math.min(blockEnd, i + 80)
    const imageUrl = findMarkdownImageUrl(lines, i + 1, searchEnd, source)
    for (let j = i + 1; j < searchEnd; j++) {
      if (/^###\s+/.test(lines[j])) break
      if (/Prompt\s*:/i.test(lines[j])) {
        const fenceStart = lines.findIndex((line, idx) => idx > j && idx < searchEnd && /^```/.test(line))
        if (fenceStart < 0) break
        const fenceEnd = lines.findIndex((line, idx) => idx > fenceStart && idx < searchEnd && /^```/.test(line))
        if (fenceEnd < 0) break
        prompt = lines.slice(fenceStart + 1, fenceEnd).join('\n').trim()
        break
      }
    }
    if (prompt) presets.push(normalizePromptPreset({ title, category, prompt, source, imageUrl }, presets.length, source))
  }
  return presets.filter(Boolean)
}

let promptPresetCache = null
async function loadPromptPresets() {
  if (promptPresetCache) return promptPresetCache
  const candidates = []
  const file = env('PROMPT_PRESETS_FILE')
  if (file) candidates.push({ type: 'file', value: file })
  const url = env('PROMPT_PRESETS_URL')
  if (url) candidates.push({ type: 'url', value: url })
  candidates.push({ type: 'file', value: join(DIST_DIR, 'prompt-presets.json') })

  for (const candidate of candidates) {
    try {
      const content = candidate.type === 'url'
        ? await fetch(candidate.value, { cache: 'no-store' }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.text()
          })
        : await readFile(candidate.value, 'utf-8')
      let list = []
      const trimmed = content.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const raw = JSON.parse(trimmed)
        const items = Array.isArray(raw) ? raw : Array.isArray(raw.prompts) ? raw.prompts : []
        list = items.map((item, index) => normalizePromptPreset(item, index, candidate.value)).filter(Boolean)
      } else {
        list = parseMarkdownPrompts(content, candidate.value)
      }
      if (list.length) {
        promptPresetCache = list.slice(0, numberEnv('MAX_PROMPT_PRESETS', 200))
        return promptPresetCache
      }
    } catch (error) {
      console.warn(`Prompt presets load skipped: ${candidate.value}`, error.message)
    }
  }
  promptPresetCache = []
  return promptPresetCache
}

async function getUserStats(username) {
  const tasks = await readJsonFile(userTasksFile(username), [])
  const files = await getImageFiles(username)
  return {
    taskCount: Array.isArray(tasks) ? tasks.length : 0,
    imageCount: files.length,
  }
}

async function handleConfig(req, res, authUser, authEnabled) {
  const authenticated = !authEnabled || Boolean(authUser)
  const promptPresets = authenticated ? await loadPromptPresets() : []
  const lockSettings = isLockSettingsEnabled()
  const lockParams = isLockParamsEnabled()
  json(res, 200, {
    authEnabled,
    authenticated,
    usernameRequired: authEnabled,
    currentUser: authUser ? publicUser(authUser, { isSelf: true }) : null,
    isAdmin: authUser?.role === 'admin',
    serverStorage: boolEnv('SERVER_STORAGE') && authenticated,
    apiProxyAvailable: isProxyEnabled(),
    lockSettings: lockSettings && authenticated,
    lockParams: lockParams && authenticated,
    hideSettings: boolEnv('HIDE_SETTINGS', lockSettings) && authenticated,
    defaultSettings: authenticated ? buildDefaultSettings() : undefined,
    lockedSettings: authenticated && lockSettings ? buildLockedSettings() : undefined,
    lockedParams: authenticated && lockParams ? buildLockedParams() : undefined,
    promptPresets,
  })
}

async function handleLogin(req, res, authEnabled) {
  if (!authEnabled) return json(res, 200, { ok: true })
  const body = await readJsonBody(req)
  const username = normalizeUsername(body.username)
  const password = String(body.password || '')
  if (!username || !password) throw new HttpError(400, '请输入账号和密码')

  const user = await findUser(username)
  if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, '账号或密码不正确')
  }
  json(res, 200, { ok: true }, { 'Set-Cookie': makeSessionCookie(user.username) })
}

function handleLogout(_req, res) {
  json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
}

function requireAdmin(authUser) {
  if (authUser?.role !== 'admin') throw new HttpError(403, '需要管理员权限')
}

async function listAdminUsers(authUser) {
  const users = await readUsers()
  return Promise.all(users.map(async (user) => publicUser(user, {
    ...(await getUserStats(user.username)),
    isSelf: user.username === authUser.username,
  })))
}

async function handleAdminUsers(req, res, url, authUser) {
  requireAdmin(authUser)

  if (req.method === 'GET' && url.pathname === '/app-api/admin/users') {
    return json(res, 200, await listAdminUsers(authUser))
  }

  if (req.method === 'POST' && url.pathname === '/app-api/admin/users') {
    const body = await readJsonBody(req)
    const username = normalizeUsername(body.username)
    const password = String(body.password || '')
    assertValidUsername(username)
    if (password.length < 4) throw new HttpError(400, '密码至少需要 4 位')

    await mutateUsers((users) => {
      if (users.some((user) => user.username === username)) throw new HttpError(409, '用户已存在')
      const now = Date.now()
      users.push({
        username,
        displayName: String(body.displayName || username).trim() || username,
        role: normalizeRole(body.role),
        disabled: Boolean(body.disabled),
        generationLimit: normalizeGenerationLimit(body.generationLimit),
        generationUsed: 0,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      })
      if (countEnabledAdmins(users) < 1) throw new HttpError(400, '至少需要保留一个启用状态的管理员')
    })
    await ensureUserDataDir(username)
    return json(res, 200, await listAdminUsers(authUser))
  }

  const match = url.pathname.match(/^\/app-api\/admin\/users\/([^/]+)$/)
  if (!match) return false
  const username = normalizeUsername(decodeURIComponent(match[1]))
  assertValidUsername(username)

  if (req.method === 'PUT') {
    const body = await readJsonBody(req)
    await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.username === username)
      if (idx < 0) throw new HttpError(404, '用户不存在')
      const current = users[idx]
      const next = { ...current }

      if (typeof body.displayName === 'string') next.displayName = body.displayName.trim() || username
      if (typeof body.role === 'string') next.role = normalizeRole(body.role)
      if (typeof body.disabled === 'boolean') next.disabled = body.disabled
      if ('generationLimit' in body) next.generationLimit = normalizeGenerationLimit(body.generationLimit)
      if ('generationUsed' in body) next.generationUsed = generationUsedOf({ generationUsed: body.generationUsed })
      if (typeof body.password === 'string' && body.password.trim()) {
        if (body.password.length < 4) throw new HttpError(400, '密码至少需要 4 位')
        next.passwordHash = hashPassword(body.password)
      }

      if (username === authUser.username) {
        if (next.role !== 'admin') throw new HttpError(400, '不能取消当前登录账号的管理员角色')
        if (next.disabled) throw new HttpError(400, '不能禁用当前登录账号')
      }

      next.updatedAt = Date.now()
      users[idx] = next
      if (countEnabledAdmins(users) < 1) throw new HttpError(400, '至少需要保留一个启用状态的管理员')
    })
    return json(res, 200, await listAdminUsers(authUser))
  }

  if (req.method === 'DELETE') {
    if (username === authUser.username) throw new HttpError(400, '不能删除当前登录账号')
    await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.username === username)
      if (idx < 0) throw new HttpError(404, '用户不存在')
      const [removed] = users.splice(idx, 1)
      if (removed.role === 'admin' && countEnabledAdmins(users) < 1) {
        users.splice(idx, 0, removed)
        throw new HttpError(400, '至少需要保留一个启用状态的管理员')
      }
    })
    await rm(userDataDir(username), { recursive: true, force: true })
    return json(res, 200, await listAdminUsers(authUser))
  }

  return false
}

function storageUsername(authUser) {
  return authUser?.username || 'default'
}

function publicTask(task, user) {
  return {
    ...task,
    ownerUsername: user.username,
    ownerDisplayName: user.displayName || user.username,
  }
}

async function listAdminTasks(authUser) {
  requireAdmin(authUser)
  const users = await readUsers()
  const tasks = []
  for (const user of users) {
    if (!isValidUsername(user.username)) continue
    await ensureUserDataDir(user.username)
    const list = await readJsonFile(userTasksFile(user.username), [])
    if (!Array.isArray(list)) continue
    for (const task of list) {
      if (task && typeof task === 'object') tasks.push(publicTask(task, user))
    }
  }
  return tasks
}

function resolveTaskOwner(url, authUser) {
  const requested = normalizeUsername(url.searchParams.get('owner') || '')
  if (requested && authUser?.role === 'admin') {
    assertValidUsername(requested)
    return requested
  }
  return storageUsername(authUser)
}

function stripTaskOwnerFields(task) {
  if (task && typeof task === 'object') {
    delete task.ownerUsername
    delete task.ownerDisplayName
  }
  return task
}

async function handleTasks(req, res, url, authUser) {
  if (!boolEnv('SERVER_STORAGE')) return text(res, 404, 'Server storage is disabled')
  const username = resolveTaskOwner(url, authUser)
  await ensureUserDataDir(username)

  if (req.method === 'GET' && url.pathname === '/app-api/tasks') {
    if (authUser?.role === 'admin' && url.searchParams.get('scope') !== 'self') {
      return json(res, 200, await listAdminTasks(authUser))
    }
    return json(res, 200, await readJsonFile(userTasksFile(username), []))
  }
  if (req.method === 'POST' && url.pathname === '/app-api/tasks/clear') {
    await writeJsonFile(userTasksFile(username), [])
    return json(res, 200, { ok: true })
  }

  const match = url.pathname.match(/^\/app-api\/tasks\/([^/]+)$/)
  if (!match) return false
  const id = sanitizeId(decodeURIComponent(match[1]))
  if (!id) return text(res, 400, 'Invalid task id')

  if (req.method === 'PUT') {
    const task = stripTaskOwnerFields(await readJsonBody(req))
    task.id = id
    await mutateTasks(username, (tasks) => {
      const idx = tasks.findIndex((item) => item?.id === id)
      if (idx >= 0) tasks[idx] = task
      else tasks.push(task)
      return id
    })
    return json(res, 200, id)
  }
  if (req.method === 'DELETE') {
    await mutateTasks(username, (tasks) => {
      const remaining = tasks.filter((item) => item?.id !== id)
      tasks.splice(0, tasks.length, ...remaining)
    })
    return json(res, 200, { ok: true })
  }
  return false
}

async function getImageFiles(username) {
  try {
    return (await readdir(userImagesDir(username))).filter((file) => file.endsWith('.json'))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function handleImages(req, res, url, authUser) {
  if (!boolEnv('SERVER_STORAGE')) return text(res, 404, 'Server storage is disabled')
  const username = storageUsername(authUser)
  await ensureUserDataDir(username)

  if (req.method === 'GET' && url.pathname === '/app-api/images') {
    const files = await getImageFiles(username)
    const images = []
    for (const file of files) {
      const image = await readJsonFile(join(userImagesDir(username), file), null)
      if (image) images.push(image)
    }
    return json(res, 200, images)
  }
  if (req.method === 'POST' && url.pathname === '/app-api/images/clear') {
    await rm(userImagesDir(username), { recursive: true, force: true })
    await mkdir(userImagesDir(username), { recursive: true })
    return json(res, 200, { ok: true })
  }

  const match = url.pathname.match(/^\/app-api\/images\/([^/]+)$/)
  if (!match) return false
  const id = sanitizeId(decodeURIComponent(match[1]))
  if (!id) return text(res, 400, 'Invalid image id')
  const file = join(userImagesDir(username), `${id}.json`)

  if (req.method === 'GET') {
    let image = await readJsonFile(file, null)
    if (!image && authUser?.role === 'admin') {
      const users = await readUsers()
      for (const user of users) {
        if (!isValidUsername(user.username) || user.username === username) continue
        image = await readJsonFile(join(userImagesDir(user.username), `${id}.json`), null)
        if (image) break
      }
    }
    return json(res, image ? 200 : 404, image || { message: '图片不存在' })
  }
  if (req.method === 'PUT') {
    const image = await readJsonBody(req)
    image.id = id
    await writeJsonFile(file, image)
    return json(res, 200, id)
  }
  if (req.method === 'DELETE') {
    await rm(file, { force: true })
    return json(res, 200, { ok: true })
  }
  return false
}

async function reserveGeneration(authUser) {
  if (!authUser?.username) return async () => {}
  const username = authUser.username
  await mutateUsers((users) => {
    const idx = users.findIndex((user) => user.username === username)
    if (idx < 0) throw new HttpError(401, '请先登录')
    const user = users[idx]
    const used = generationUsedOf(user)
    const limit = generationLimitOf(user)
    if (limit != null && used >= limit) {
      throw new HttpError(429, '生成次数已用完，请联系管理员增加次数')
    }
    users[idx] = {
      ...user,
      generationUsed: used + 1,
      updatedAt: Date.now(),
    }
  })

  let refunded = false
  return async () => {
    if (refunded) return
    refunded = true
    await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.username === username)
      if (idx < 0) return
      const used = generationUsedOf(users[idx])
      users[idx] = {
        ...users[idx],
        generationUsed: Math.max(0, used - 1),
        updatedAt: Date.now(),
      }
    }).catch(() => {})
  }
}

async function handlePromptEndpoint(_req, res) {
  json(res, 200, await loadPromptPresets())
}

function proxyTargetUrl(url) {
  const endpoint = url.pathname.replace(/^\/api-proxy\/?/, '')
  if (!/^(v1\/)?(images\/generations|images\/edits|responses)$/.test(endpoint)) return null

  const target = getProxyTarget()
  const targetUrl = new URL(target)
  let path = endpoint
  if (targetUrl.pathname.endsWith('/v1') && path.startsWith('v1/')) path = path.slice(3)
  targetUrl.pathname = `${targetUrl.pathname.replace(/\/+$/, '')}/${path}`
  targetUrl.search = url.search
  return targetUrl.toString()
}

async function handleProxy(req, res, url, authUser) {
  if (!isProxyEnabled()) return text(res, 404, 'API proxy is disabled')
  if (!['POST', 'OPTIONS'].includes(req.method)) return text(res, 405, 'Method Not Allowed')
  const target = proxyTargetUrl(url)
  if (!target) return text(res, 403, 'Forbidden: API Proxy path restricted')
  if (req.method === 'OPTIONS') return text(res, 204, '')

  const body = await readBody(req)
  const refundGeneration = await reserveGeneration(authUser)
  const apiKey = env('APP_API_KEY') || env('DEFAULT_API_KEY')
  const headers = {
    accept: req.headers.accept || 'application/json',
    'cache-control': req.headers['cache-control'] || 'no-store, no-cache, max-age=0',
    pragma: req.headers.pragma || 'no-cache',
  }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

  const timeoutSeconds = Math.max(10, numberEnv('APP_TIMEOUT', 300))
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000)
  let upstream
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
  } catch (error) {
    await refundGeneration()
    if (error?.name === 'AbortError') {
      throw new HttpError(504, `上游 API 请求超时（${timeoutSeconds} 秒）`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
  if (!upstream.ok) await refundGeneration()

  const upstreamBody = Buffer.from(await upstream.arrayBuffer())
  const responseHeaders = {}
  for (const [key, value] of upstream.headers.entries()) {
    if (['transfer-encoding', 'content-encoding', 'connection'].includes(key.toLowerCase())) continue
    responseHeaders[key] = value
  }
  responseHeaders['Cache-Control'] = 'no-store'
  res.writeHead(upstream.status, responseHeaders)
  res.end(upstreamBody)
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0])
  const normalized = normalize(decoded).replace(/^\.\.(?:\/|\\|$)/, '')
  const file = resolve(DIST_DIR, `.${sep}${normalized}`)
  return file.startsWith(DIST_DIR) ? file : join(DIST_DIR, 'index.html')
}

async function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) return text(res, 405, 'Method Not Allowed')
  let file = safeStaticPath(url.pathname)
  try {
    const s = await stat(file)
    if (s.isDirectory()) file = join(file, 'index.html')
  } catch {
    file = join(DIST_DIR, 'index.html')
  }

  try {
    const s = await stat(file)
    const ext = extname(file).toLowerCase()
    const cacheControl = file.includes(`${sep}assets${sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': s.size,
      'Cache-Control': cacheControl,
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  } catch {
    text(res, 404, 'Not Found')
  }
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    const authEnabled = await isAuthEnabled()
    const authUser = authEnabled ? await getAuthUser(req) : null

    if (url.pathname === '/app-api/config' && req.method === 'GET') return await handleConfig(req, res, authUser, authEnabled)
    if (url.pathname === '/app-api/login' && req.method === 'POST') return await handleLogin(req, res, authEnabled)

    if ((url.pathname.startsWith('/app-api/') || url.pathname.startsWith('/api-proxy/')) && authEnabled && !authUser) {
      return json(res, 401, { message: '请先登录' })
    }

    if (url.pathname === '/app-api/logout' && req.method === 'POST') return handleLogout(req, res)
    if (url.pathname.startsWith('/app-api/admin/users')) {
      const handled = await handleAdminUsers(req, res, url, authUser)
      if (handled !== false) return
    }
    if (url.pathname === '/app-api/prompts' && req.method === 'GET') return await handlePromptEndpoint(req, res)
    if (url.pathname.startsWith('/app-api/tasks')) {
      const handled = await handleTasks(req, res, url, authUser)
      if (handled !== false) return
    }
    if (url.pathname.startsWith('/app-api/images')) {
      const handled = await handleImages(req, res, url, authUser)
      if (handled !== false) return
    }
    if (url.pathname.startsWith('/api-proxy/')) return await handleProxy(req, res, url, authUser)

    return await serveStatic(req, res, url)
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500
    const message = error instanceof Error ? error.message : String(error)
    if (statusCode >= 500) {
      console.error(error)
    } else {
      console.warn(`${req.method} ${url.pathname} -> ${statusCode}: ${message}`)
    }
    return json(res, statusCode, { message })
  }
}

await ensureDataDir()
createServer(route).listen(PORT, HOST, async () => {
  const userCount = (await readUsers()).length
  console.log(`GenImage server listening on ${HOST}:${PORT}`)
  console.log(`static=${DIST_DIR} data=${DATA_DIR} users=${userCount} storage=${boolEnv('SERVER_STORAGE') ? 'on' : 'off'} proxy=${isProxyEnabled() ? 'on' : 'off'}`)
})
