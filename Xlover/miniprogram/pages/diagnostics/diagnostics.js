const storage = require('../../utils/storage.js')
const backup = require('../../utils/backup.js')
const selfCheck = require('../../utils/selfCheck.js')
const migration = require('../../utils/migrateCloud.js')
const foodLibrary = require('../../utils/foodLibrary.js')

Page({
  data: {
    storeInfo: '',
    running: false,
    report: null,
    reportText: '',
    results: [],
    summary: null,
    migrationPreview: null,
    migrationIssues: [],
    migrationDone: null,
    backupList: []
  },

  onLoad () {
    this.store = storage.createStore({ adapter: storage.createWxAdapter(), appVersion: 'dev' })
    const initRes = this.store.init()
    if (initRes.ok) {
      this.store.setLibraryVersion(foodLibrary.libraryVersion())
    }
    this.refreshStoreInfo()
  },

  refreshStoreInfo () {
    const usage = this.store.estimateUsage()
    const foodCount = this.store.getFoodLogs().length
    const workoutCount = this.store.getWorkoutLogs().length
    this.setData({
      storeInfo: `数据版本 ${this.store.schemaVersion}｜体重 ${this.store.getBodyRecords().length} 条｜饮食 ${foodCount} 条｜训练 ${workoutCount} 条｜占用约 ${(usage.approxBytes / 1024).toFixed(1)}KB / 总配额 ${usage.limitSizeKB}KB`,
      backupList: this.store.listPreImportBackups()
    })
  },

  async runChecks () {
    if (this.data.running) return
    this.setData({ running: true })
    wx.showLoading({ title: '自检中...' })
    try {
      const svc = backup.createBackupService({ store: this.store, io: backup.createWxIo(), appVersion: 'dev' })
      const report = await selfCheck.runSelfCheck({ store: this.store, io: svc.io, backupService: svc })
      this.setData({
        report,
        results: report.results,
        summary: report.summary,
        reportText: selfCheck.formatReport(report)
      })
      this.refreshStoreInfo()
    } catch (e) {
      wx.showToast({ title: e.message || '自检失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ running: false })
    }
  },

  runQuotaProbe () {
    wx.showModal({
      title: '配额压测',
      content: '将逐档写入测试数据直到触顶，过程会自动清理。建议在已导出备份后再执行。是否继续？',
      success: res => {
        if (!res.confirm) return
        wx.showLoading({ title: '压测中...' })
        try {
          const r = selfCheck.probeStorageLimit({ stepKB: 512, maxKB: 10240 })
          this.setData({
            results: this.data.results.concat([r]),
            summary: null
          })
          this.refreshStoreInfo()
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  copyReport () {
    const text = this.data.reportText || (this.data.storeInfo + '\n（尚未运行自检）')
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  async previewMigration () {
    if (typeof wx.cloud === 'undefined') {
      wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
      return
    }
    wx.showLoading({ title: '读取云端...' })
    try {
      const reader = migration.createCloudReader({
        callFunction: opts => wx.cloud.callFunction(opts)
      })
      const raw = await reader.fetchAll({ diagnostics: true })
      const preview = migration.previewMigration(this.store, raw)
      this._rawCloud = raw
      this.setData({
        migrationPreview: preview.stats,
        migrationIssues: preview.issues.concat((preview.errors || []).map(e => ({ level: 'error', code: 'validate', message: e })))
      })
    } catch (e) {
      wx.showToast({ title: e.message || '读取失败', icon: 'none', duration: 3000 })
    } finally {
      wx.hideLoading()
    }
  },

  runMigration () {
    if (!this._rawCloud) {
      wx.showToast({ title: '请先预览云端数据', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认迁移',
      content: '将把云端历史数据合并到本地（不覆盖本地已有记录），写入前会自动留一份备份。',
      success: res => {
        if (!res.confirm) return
        wx.showLoading({ title: '迁移中...' })
        try {
          const r = migration.runMigration(this.store, this._rawCloud, { mode: 'merge' })
          this.setData({ migrationDone: { ok: r.ok, summary: r.summary, errors: r.errors } })
          wx.showToast({ title: r.ok ? '迁移完成' : '迁移失败', icon: r.ok ? 'success' : 'none' })
        } catch (e) {
          wx.showToast({ title: e.message || '迁移异常', icon: 'none' })
        } finally {
          wx.hideLoading()
          this.refreshStoreInfo()
        }
      }
    })
  },

  async exportBackup () {
    wx.showLoading({ title: '导出中...' })
    try {
      const svc = backup.createBackupService({ store: this.store, io: backup.createWxIo(), appVersion: 'dev' })
      const r = await svc.exportToFile()
      wx.hideLoading()
      wx.showModal({
        title: '导出完成',
        content: `${r.fileName}\n${r.bytes} 字节\n${r.shared ? '已唤起分享' : '分享未完成，可重试'}`,
        showCancel: false
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '导出失败', icon: 'none' })
    }
  },

  async importBackup () {
    try {
      const svc = backup.createBackupService({ store: this.store, io: backup.createWxIo(), appVersion: 'dev' })
      const r = await svc.importFromFile({
        mode: 'merge',
        confirm: summary => new Promise(resolve => {
          const p = summary.payload
          wx.showModal({
            title: '确认导入',
            content: `备份含：体重 ${p.bodyRecords} 条、训练 ${p.workoutLogs} 条、饮食 ${p.foodLogs} 条、目标快照 ${p.targetSnapshots} 条。合并到本地（不覆盖已有记录），导入前会自动备份。`,
            success: res => resolve(!!res.confirm),
            fail: () => resolve(false)
          })
        })
      })
      if (r.cancelled) return
      wx.showToast({ title: r.ok ? '导入完成' : '导入失败', icon: r.ok ? 'success' : 'none' })
      this.refreshStoreInfo()
    } catch (e) {
      wx.showToast({ title: e.message || '导入失败', icon: 'none', duration: 3000 })
    }
  },

  restoreBackup (e) {
    const key = e.currentTarget.dataset.key
    wx.showModal({
      title: '恢复备份',
      content: '将用该备份整体覆盖当前本地数据（恢复前会再留一份备份）。',
      success: res => {
        if (!res.confirm) return
        const r = this.store.restorePreImportBackup(key)
        wx.showToast({ title: r.ok ? '已恢复' : '恢复失败', icon: r.ok ? 'success' : 'none' })
        this.refreshStoreInfo()
      }
    })
  }
})
