import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const GH = './tools/bin/gh.exe'
const REPO = '3289201616/mc-doll-workshop'
const head = process.argv[2] || 'README.md'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const api = (args, body) => {
  const input = body === undefined ? [] : ['--input', '-']
  const out = execFileSync(GH, ['api', ...args, ...input], {
    input: body === undefined ? undefined : JSON.stringify(body),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(out)
}

const localSha = git('rev-parse', 'HEAD')
const parentSha = git('rev-parse', 'HEAD^')
const localTree = git('rev-parse', 'HEAD^{tree}')
const parentTree = git('rev-parse', `${parentSha}^{tree}`)
const name = git('log', '-1', '--format=%an')
const email = git('log', '-1', '--format=%ae')
const date = git('log', '-1', '--format=%aI')
// 直接从原始 commit 对象里取消息，避免 %B 的尾换行被 trim 掉
const rawCommit = execFileSync('git', ['cat-file', 'commit', 'HEAD'], { encoding: 'utf8' })
const message = rawCommit.slice(rawCommit.indexOf('\n\n') + 2)

console.log('local', localSha.slice(0, 7), 'parent', parentSha.slice(0, 7), 'tree', localTree.slice(0, 7))

const blob = api(
  ['--method', 'POST', `repos/${REPO}/git/blobs`],
  // 取 git 对象里的原始字节（LF），不能用工作区文件（可能是 CRLF）
  { content: execFileSync('git', ['cat-file', 'blob', `HEAD:${head}`], { encoding: 'buffer' }).toString('base64'), encoding: 'base64' },
)
console.log('blob', blob.sha.slice(0, 7))

const tree = api(['--method', 'POST', `repos/${REPO}/git/trees`], {
  base_tree: parentTree,
  tree: [{ path: head, mode: '100644', type: 'blob', sha: blob.sha }],
})
console.log('tree', tree.sha.slice(0, 7), tree.sha === localTree ? '(与本地一致)' : '(与本地不一致!)')

const commit = api(['--method', 'POST', `repos/${REPO}/git/commits`], {
  message,
  tree: tree.sha,
  parents: [parentSha],
  author: { name, email, date },
  committer: { name, email, date },
})
console.log('commit', commit.sha.slice(0, 7), commit.sha === localSha ? '✓ 和本地 SHA 完全一致' : `✗ 本地是 ${localSha.slice(0, 7)}`)

if (commit.sha !== localSha) {
  console.log('中止：SHA 不一致就不动 ref，避免远端本地分叉')
  process.exit(1)
}

const ref = api(['--method', 'PATCH', `repos/${REPO}/git/refs/heads/main`], {
  sha: commit.sha,
  force: false,
})
console.log('ref ->', ref.object.sha.slice(0, 7), '远端已更新')
