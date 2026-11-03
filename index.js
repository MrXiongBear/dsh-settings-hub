/**
 * Host half of the Plugin Settings Hub bundle.
 *
 * The hub itself is Client-only: it adds one "Plugin settings" page to the
 * Settings dialog and folds the per-plugin pages into it. The Host half exists
 * for two reasons:
 *
 *   1. a bundle entry needs a loadable Host module, and
 *   2. it receives the Client half's self-check report on
 *
 *        POST /api/settings-hub/status
 *
 *      and stores it next to this file (`.diagnostics.json`). The report says
 *      whether the navigation filter could be installed and what the hub is
 *      listing, which is the only way to verify a browser-side change without
 *      reading the DOM by hand.
 *
 * The route is registered on the Connection Fetch surface, so it passes the same
 * Host/Origin and browser-cookie authentication as the rest of `/api`.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-settings-hub'
export const inject = ['connection']

const ROUTE_ROOT = '/api/settings-hub'
const STATUS_PATH = `${ROUTE_ROOT}/status`
const BODY_LIMIT = 64 * 1024
const STATUS_FILE = join(dirname(fileURLToPath(import.meta.url)), '.diagnostics.json')

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readJson(request) {
  const text = await request.text()
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('empty request body')
  }
  if (Buffer.byteLength(text, 'utf8') > BODY_LIMIT) {
    throw new Error('request body too large')
  }
  return JSON.parse(text)
}

export function apply(ctx) {
  ctx.connection.fetch.register({
    path: STATUS_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.method !== 'POST') {
        return jsonResponse(405, { ok: false, error: 'method not allowed' })
      }
      let payload
      try {
        payload = await readJson(request)
      } catch (error) {
        return jsonResponse(400, {
          ok: false,
          error: error && error.message ? String(error.message) : String(error),
        })
      }
      const record = { at: new Date().toISOString(), report: payload }
      try {
        await mkdir(dirname(STATUS_FILE), { recursive: true })
        await writeFile(STATUS_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      } catch (error) {
        // The report is still returned to the Client half so it can be read from
        // the browser console when the Host cannot write next to itself.
        return jsonResponse(200, {
          ok: false,
          code: 'not-persisted',
          error: error && error.message ? String(error.message) : String(error),
          report: payload,
        })
      }
      return jsonResponse(200, { ok: true })
    },
  })
}
