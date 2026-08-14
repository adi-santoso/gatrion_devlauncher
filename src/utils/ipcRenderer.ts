/**
 * IPC Renderer Utilities — legacy facade.
 *
 * The implementation now lives in the data layer (src/data/*); this module is
 * kept as a stable re-export so existing consumers and tests keep working.
 * New code should import from `src/data` directly.
 */
export * from '../data/index'
