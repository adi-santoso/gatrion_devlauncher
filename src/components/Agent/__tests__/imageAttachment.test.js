import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileToAttachment, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from '../imageAttachment'

let restoreFakes = null

function installFakes({ withCanvas = false } = {}) {
  const originals = {
    FileReader: global.FileReader,
    Image: global.Image,
    getContext: window.HTMLCanvasElement?.prototype?.getContext,
    toDataURL: window.HTMLCanvasElement?.prototype?.toDataURL,
  }
  global.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,QUJDRA=='
      queueMicrotask(() => this.onload?.())
    }
  }
  global.Image = class {
    get width() { return 2000 }
    get height() { return 1000 }
    set src(_value) { queueMicrotask(() => this.onload?.()) }
  }
  if (withCanvas && window.HTMLCanvasElement?.prototype) {
    window.HTMLCanvasElement.prototype.getContext = function getContext() {
      restoreFakes = { ...restoreFakes, seenCanvas: this }
      return { drawImage: vi.fn() }
    }
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,QUJDRA=='
  }
  restoreFakes = { ...(restoreFakes || {}), ...originals }
}

afterEach(() => {
  if (restoreFakes) {
    global.FileReader = restoreFakes.FileReader
    global.Image = restoreFakes.Image
    if (window.HTMLCanvasElement?.prototype) {
      window.HTMLCanvasElement.prototype.getContext = restoreFakes.getContext
      window.HTMLCanvasElement.prototype.toDataURL = restoreFakes.toDataURL
    }
    restoreFakes = null
  }
})

describe('fileToAttachment', () => {
  it('exports sane limits', () => {
    expect(MAX_ATTACHMENTS).toBe(8)
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024)
  })

  it('passes the original bytes through when canvas is unavailable', async () => {
    installFakes({ withCanvas: false })
    const file = new File(['abc'], 'shot.png', { type: 'image/png' })
    const attachment = await fileToAttachment(file)
    expect(attachment).toMatchObject({
      name: 'shot.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QUJDRA==',
      base64: 'QUJDRA==',
    })
  })

  it('downscales to the max dimension and re-encodes via canvas', async () => {
    installFakes({ withCanvas: true })
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })
    const attachment = await fileToAttachment(file)
    // 2000x1000 -> capped at 1568 wide, keeping aspect ratio
    expect(restoreFakes.seenCanvas.width).toBe(1568)
    expect(restoreFakes.seenCanvas.height).toBe(784)
    expect(attachment).toMatchObject({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      base64: 'QUJDRA==',
    })
  })
})
