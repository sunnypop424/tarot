import { mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * 슬롯 이미지 업로드 — **개발 서버 전용** (apply: 'serve').
 *
 * 테마 편집기는 소유자가 로컬에서만 쓰므로, 업로드를 data URI 로 JSON 에 밀어 넣는 대신
 * 실제 파일로 `public/slots/{slug}/` 에 저장한다. 그 파일을 그대로 커밋하면 배포가 된다.
 * (78장을 data URI 로 담으면 JSON 이 수 MB 가 되어 번들이 망가진다)
 *
 * 프로덕션 빌드에는 이 미들웨어가 존재하지 않는다.
 */

const ROOT = 'public/slots'
/** 경로 조작 방어 — 로컬 전용이어도 ../ 로 레포 밖을 쓰게 두면 안 된다 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i
const SAFE_NAME = /^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp|gif|svg)$/i

function bad(res, code, message) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: message }))
}

async function readBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return JSON.parse(body)
}

export function slotAssets() {
  return {
    name: 'slot-assets',
    apply: 'serve',
    configureServer(server) {
      // 업로드 — { slug, name, dataUrl } → public/slots/{slug}/{name}
      server.middlewares.use('/__slot-upload', async (req, res) => {
        if (req.method !== 'POST') return bad(res, 405, 'POST 만 됩니다')
        try {
          const { slug, name, dataUrl } = await readBody(req)
          if (!SAFE_SLUG.test(slug ?? '')) return bad(res, 400, '슬러그 형식 오류')
          if (!SAFE_NAME.test(name ?? '')) return bad(res, 400, '파일명 형식 오류')
          if (name.includes('..')) return bad(res, 400, '경로 조작 불가')

          const base64 = String(dataUrl).split(',')[1]
          if (!base64) return bad(res, 400, '이미지를 읽지 못했습니다')

          const target = join(ROOT, slug, name)
          await mkdir(join(target, '..'), { recursive: true })
          await writeFile(target, Buffer.from(base64, 'base64'))

          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ url: `/slots/${slug}/${name}` }))
        } catch (e) {
          bad(res, 500, String(e))
        }
      })

      // 목록 — ?slug=x → 이미 올린 파일이 뭔지 편집기가 알아야 한다
      server.middlewares.use('/__slot-assets', async (req, res) => {
        const slug = new URL(req.url, 'http://x').searchParams.get('slug')
        if (!SAFE_SLUG.test(slug ?? '')) return bad(res, 400, '슬러그 형식 오류')

        const dir = join(ROOT, slug)
        const files = existsSync(dir) ? await walk(dir, '') : []
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ files }))
      })

      // 삭제 — { slug, name }
      server.middlewares.use('/__slot-delete', async (req, res) => {
        if (req.method !== 'POST') return bad(res, 405, 'POST 만 됩니다')
        try {
          const { slug, name } = await readBody(req)
          if (!SAFE_SLUG.test(slug ?? '') || !SAFE_NAME.test(name ?? '') || name.includes('..')) {
            return bad(res, 400, '형식 오류')
          }
          await rm(join(ROOT, slug, name), { force: true })
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          bad(res, 500, String(e))
        }
      })
    },
  }
}

/** 하위 디렉터리까지 상대 경로로 훑는다 */
async function walk(dir, prefix) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)))
    else if (extname(entry.name)) out.push(rel)
  }
  return out
}
