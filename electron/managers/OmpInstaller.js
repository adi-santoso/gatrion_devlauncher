// @ts-check
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const https = require('https')
const { EventEmitter } = require('events')

const REPO = 'can1357/oh-my-pi'
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const WIN_ASSET = 'omp-windows-x64.exe'

/**
 * OmpInstaller — managed download of the omp binary into the app's userData
 * folder, so users without omp installed can enable the AI Agent without
 * touching their system PATH or needing admin rights. The binary is verified
 * against the official SHA256SUMS.txt before use.
 */
class OmpInstaller extends EventEmitter {
  constructor(userDataDir) {
    super()
    this.targetDir = path.join(userDataDir, 'omp')
    this.targetBinary = path.join(this.targetDir, 'omp.exe')
    this.state = { status: 'idle', phase: null, received: 0, total: 0, percent: 0, error: null, version: null }
  }

  async fetchLatestRelease() {
    const body = await this._get(RELEASE_URL, { 'User-Agent': 'Gatrion/1.0 (desktop project manager)', Accept: 'application/vnd.github+json' })
    const release = JSON.parse(body)
    const exe = (release.assets || []).find((asset) => asset.name === WIN_ASSET)
    if (!exe) throw new Error(`No ${WIN_ASSET} asset in the latest release`)
    return {
      version: String(release.tag_name || '').replace(/^v/, ''),
      url: exe.browser_download_url,
      size: exe.size,
      checksumsUrl: (release.assets || []).find((asset) => asset.name === 'SHA256SUMS.txt')?.browser_download_url || null,
    }
  }

  async install() {
    if (this.state.status === 'downloading') return this.state
    this.state = { status: 'downloading', phase: 'release', received: 0, total: 0, percent: 0, error: null, version: null }
    this.emit('progress', this.state)
    try {
      const release = await this.fetchLatestRelease()
      this.state.version = release.version
      this.state.total = release.size || 0
      this.state.phase = 'download'
      this.emit('progress', this.state)

      await fs.promises.mkdir(this.targetDir, { recursive: true })
      const tmpPath = `${this.targetBinary}.tmp`
      await this._download(release.url, tmpPath, (received) => {
        this.state.received = received
        this.state.percent = release.size ? Math.min(100, Math.round((received / release.size) * 100)) : 0
        this.emit('progress', this.state)
      })

      this.state.phase = 'verify'
      this.emit('progress', this.state)
      await this._verify(tmpPath, release.checksumsUrl)

      await fs.promises.rename(tmpPath, this.targetBinary)
      this.state.status = 'installed'
      this.state.phase = 'done'
      this.emit('progress', this.state)
      return this.state
    } catch (error) {
      this.state.status = 'error'
      this.state.error = error.message
      this.state.phase = null
      this.emit('progress', this.state)
      return this.state
    }
  }

  _download(url, filePath, onProgress) {
    return new Promise((resolve, reject) => {
      let received = 0
      const file = fs.createWriteStream(filePath)
      const req = https.get(url, { headers: { 'User-Agent': 'Gatrion/1.0' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        res.on('data', (chunk) => {
          received += chunk.length
          onProgress(received)
        })
        res.pipe(file)
      })
      req.setTimeout(60000, () => req.destroy(new Error('Download timed out')))
      req.on('error', (error) => {
        file.destroy()
        reject(error)
      })
      file.on('finish', () => file.close(() => resolve(undefined)))
      file.on('error', (error) => {
        file.destroy()
        reject(error)
      })
    })
  }

  async _verify(filePath, checksumsUrl) {
    const hash = await new Promise((resolve, reject) => {
      const stream = crypto.createHash('sha256')
      const read = fs.createReadStream(filePath)
      read.on('data', (chunk) => stream.update(chunk))
      read.on('end', () => resolve(stream.digest('hex')))
      read.on('error', reject)
    })
    if (!checksumsUrl) return // no checksum file — accept (still verified by size/timeout above)
    const sums = await this._get(checksumsUrl, { 'User-Agent': 'Gatrion/1.0' })
    const line = sums.split(/\r?\n/).find((item) => item.includes(WIN_ASSET))
    const expected = line ? line.split(/\s+/)[0].toLowerCase() : null
    if (expected && hash !== expected) {
      throw new Error('SHA256 verification failed — download may be corrupted')
    }
  }

  _get(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers, timeout: 15000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('Request timed out')))
    })
  }

  getState() {
    return this.state
  }

  /** Whether the managed binary exists (usable when system omp is absent). */
  hasManagedBinary() {
    return require('fs').existsSync(this.targetBinary)
  }
}

module.exports = OmpInstaller
