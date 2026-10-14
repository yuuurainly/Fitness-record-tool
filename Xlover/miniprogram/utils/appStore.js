/**
 * 本地数据层的单例入口
 *
 * 页面不要各自 createStore，统一从这里取，避免重复初始化和迁移。
 */

const storage = require('./storage.js')
const foodLibrary = require('./foodLibrary.js')

const APP_VERSION = '2.0.0'

let instance = null
let initResult = null

function getStore () {
  if (!instance) {
    instance = storage.createStore({ adapter: storage.createWxAdapter(), appVersion: APP_VERSION })
    initResult = instance.init()
    if (initResult.ok) instance.setLibraryVersion(foodLibrary.libraryVersion())
  }
  return instance
}

function getInitResult () {
  return initResult
}

/** 测试或特殊场景下替换实现 */
function setStore (store) {
  instance = store
  initResult = { ok: true, applied: [], schemaVersion: store.schemaVersion }
  return instance
}

function resetStore () {
  instance = null
  initResult = null
}

module.exports = {
  APP_VERSION,
  getStore,
  getInitResult,
  setStore,
  resetStore
}
