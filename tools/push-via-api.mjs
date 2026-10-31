/**
 * 在 github.com 的 443 被代理挡掉、只有 api.github.com 能通的环境里提交代码。
 *
 * 走 Git Database API 手工重放一次本地提交：blob → tree → commit → 更新 ref。
 * 关键点是所有内容都从 git 对象里取原始字节（而不是工作区文件，工作区可能是
 * CRLF），提交信息也按原文重建，这样远端算出来的 SHA 和本地完全一致，
 * 不会出现「远端一个提交、本地一个提交」的分叉。
 *
 * 用法：node tools/push-via-api.mjs [owner/repo]
 */
import { execFileSync } from 'node:child_process'

const GH = './tools/bin/gh.exe'
const REPO = process.argv[2] || '3289201616/mc-doll-workshop'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const gitBytes = (...args) => execFileSync('git', args, { encoding: 'buffer' })

function api(args, body) {
  const input = body === undefined ? [] : ['--input', '-']
  const out = execFileSync(GH, ['api', ...args, ...input], {
    input: body === undefined ? undefined : JSON.stringify(body),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

const localSha = git('rev-parse', 'HEAD')
const parentSha = git('rev-parse', 'HEAD^')
const localTree = git('rev-parse', 'HEAD^{tree}')
const parentTree = git('rev-parse', `${parentSha}^{tree}`)

const rawCommit = execFileSync('git', ['cat-file', 'commit', 'HEAD'], { encoding: 'utf8' })
const headerEnd = rawCommit.indexOf('\n\n')
const message = rawCommit.slice(headerEnd + 2)
const header = rawCommit.slice(0, headerEnd)
const authorLine = (header.match(/^author (.*)$/m) || [])[1] || ''
const committerLine = (header.match(/^committer (.*)$/m) || [])[1] || ''
const parsePerson = (line) => ({
  name: line.replace(/\s*<.*$/, ''),
  email: (line.match(/<(.*)>/) || [])[1] || '',
})
const author = parsePerson(authorLine)
const committer = parsePerson(committerLine)
// 直接用 git 的 ISO 时间，别手算时区偏移
const authorDate = git('log', '-1', '--format=%aI')
const committerDate = git('log', '-1', '--format=%cI')

// 相对父提交改了哪些文件：新增/修改要传内容，删除传 sha: null
const changes = git('diff', '--name-status', 'HEAD^', 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split('\t')
    return { status: status[0], path: rest[rest.length - 1] }
  })

if (!changes.length) {
  console.log('没有相对父提交的改动，退出')
  process.exit(0)
}

const entries = []
for (const change of changes) {
  if (change.status === 'D') {
    entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null })
    continue
  }
  const [meta] = git('ls-tree', 'HEAD', '--', change.path).split('\t')
  const [mode, type, sha] = meta.split(/\s+/)
  // git 里已经是最终字节，直接 base64 交给 API，避免任何换行转换
  const content = gitBytes('cat-file', 'blob', `${localSha}:${change.path}`).toString('base64')
  const blob = api(['--method', 'POST', `repos/${REPO}/git/blobs`], {
    content,
    encoding: 'base64',
  })
  if (blob.sha !== sha) {
    console.log(`! ${change.path} blob 不一致（本地 ${sha.slice(0, 7)} / 远端 ${blob.sha.slice(0, 7)}）`)
  }
  entries.push({ path: change.path, mode, type, sha: blob.sha })
}

const tree = api(['--method', 'POST', `repos/${REPO}/git/trees`], {
  base_tree: parentTree,
  tree: entries,
})
const treeOk = tree.sha === localTree
console.log(`tree ${tree.sha.slice(0, 7)} ${treeOk ? '✓ 与本地一致' : '✗ 与本地不一致'}`)

const commit = api(['--method', 'POST', `repos/${REPO}/git/commits`], {
  message,
  tree: tree.sha,
  parents: [parentSha],
  author: authorDate ? { ...author, date: authorDate } : author,
  committer: committerDate ? { ...committer, date: committerDate } : committer,
})
const commitOk = commit.sha === localSha
console.log(
  `commit ${commit.sha.slice(0, 7)} ${
    commitOk ? '✓ 与本地 SHA 完全一致' : `✗ 本地是 ${localSha.slice(0, 7)}`
  }`,
)

if (!commitOk) {
  console.log('中止：SHA 对不上就不动 ref，避免远端和本地分叉')
  process.exit(1)
}

api(['--method', 'PATCH', `repos/${REPO}/git/refs/heads/main`], { sha: commit.sha, force: false })
console.log(`ref -> ${commit.sha.slice(0, 7)}，远端已更新`)
