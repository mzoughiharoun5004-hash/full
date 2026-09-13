import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import process from 'node:process'

const npmCli = process.env.npm_execpath
  ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const services = [
  {
    name: 'backend',
    path: 'pfe-backend/pfe_backend',
    script: 'start:dev',
  },
  {
    name: 'frontend',
    path: 'pfe-frontend/pfe',
    script: 'dev',
  },
]

let shuttingDown = false

const children = services.map(({ name, path, script }) => {
  const child = spawn(process.execPath, [npmCli, '--prefix', path, 'run', script], {
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })

  child.on('error', (error) => {
    console.error(`[dev] Failed to start ${name}:`, error.message)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
    console.error(`[dev] ${name} stopped with ${reason}`)
    shutdown(code ?? 1)
  })

  return child
})

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  setTimeout(() => process.exit(exitCode), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
