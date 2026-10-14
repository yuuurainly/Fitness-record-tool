const appStore = require('../../utils/appStore.js')
const backup = require('../../utils/backup.js')
const foodLibrary = require('../../utils/foodLibrary.js')

Page({
  data: {
    usage: null,
    counts: { body: 0, food: 0, workout: 0, snapshots: 0, customFoods: 0 },
    backups: [],
    appVersion: '',
    schemaVersion: 1,
    libraryVersion: '',
    lastAction: null,
    busy: false
  },

  onShow () {
    this.refresh()
  },

  refresh () {
    const store = appStore.getStore()
    const usage = store.estimateUsage()
    this.setData({
      usage: Object.assign({}, usage, { usedKB: Math.round(usage.approxBytes / 1024 * 10) / 10 }),
      counts: {
        body: store.getBodyRecords().length,
        food: store.getFoodLogs().length,
        workout: store.getWorkoutLogs().length,
        snapshots: store.listSnapshotDates().length,
        customFoods: store.getCustomFoods().length
      },
      backups: store.listPreImportBackups().slice().reverse().map(b => ({
        key: b.key,
        createdAt: (b.createdAt || '').slice(0, 16).replace('T', ' ')
      })),
      appVersion: appStore.APP_VERSION,
      schemaVersion: store.schemaVersion,
      libraryVersion: foodLibrary.libraryVersion()
    })
  },

  service () {
    return backup.createBackupService({
      store: appStore.getStore(),
      io: backup.createWxIo(),
      appVersion: appStore.APP_VERSION
    })
  },

  async exportBackup () {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.showLoading({ title: '导出中...' })
    try {
      const r = await this.service().exportToFile()
      wx.hideLoading()
      this.setData({
        lastAction: {
          ok: true,
          text: `已导出 ${r.fileName}（${(r.bytes / 1024).toFixed(1)} KB）${r.shared ? '，已唤起分享' : ''}`
        }
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ lastAction: { ok: false, text: e.message || '导出失败' } })
    } finally {
      this.setData({ busy: false })
      this.refresh()
    }
  },

  async exportClipboard () {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const r = await this.service().exportToClipboard()
      this.setData({ lastAction: { ok: true, text: `已复制到剪贴板（${(r.bytes / 1024).toFixed(1)} KB），可粘贴保存` } })
    } catch (e) {
      this.setData({ lastAction: { ok: false, text: e.message || '复制失败' } })
    } finally {
      this.setData({ busy: false })
    }
  },

  async importFile () {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const r = await this.service().importFromFile({
        mode: 'merge',
        confirm: summary => new Promise(resolve => {
          const p = summary.payload
          wx.showModal({
            title: '确认导入',
            content: `备份时间：${(summary.exportedAt || '').slice(0, 16).replace('T', ' ')}\n` +
              `体重 ${p.bodyRecords} 条 · 训练 ${p.workoutLogs} 条 · 饮食 ${p.foodLogs} 条 · 目标快照 ${p.targetSnapshots} 条\n\n` +
              '将合并到本地，本地已有记录不会被覆盖；导入前会自动保存一份备份。',
            confirmText: '确认导入',
            success: res => resolve(!!res.confirm),
            fail: () => resolve(false)
          })
        })
      })

      if (r.cancelled) {
        this.setData({ lastAction: { ok: true, text: '已取消导入，本地数据未改动' } })
      } else if (r.ok) {
        const s = r.summary || {}
        this.setData({
          lastAction: {
            ok: true,
            text: `导入完成：体重 +${s.bodyRecords || 0} · 训练 +${s.workoutLogs || 0} · 饮食 +${s.foodLogs || 0} · 快照 +${s.targetSnapshots || 0}`
          }
        })
      } else {
        this.setData({ lastAction: { ok: false, text: '导入被拒绝，本地数据未改动：' + (r.errors || []).join('；') } })
      }
    } catch (e) {
      this.setData({ lastAction: { ok: false, text: e.message || '导入失败' } })
    } finally {
      this.setData({ busy: false })
      this.refresh()
    }
  },

  restoreBackup (e) {
    const key = e.currentTarget.dataset.key
    wx.showModal({
      title: '恢复备份',
      content: '将用这份备份整体覆盖当前本地数据（恢复前会再自动留一份备份）。确定继续？',
      confirmText: '恢复',
      success: res => {
        if (!res.confirm) return
        const r = appStore.getStore().restorePreImportBackup(key)
        this.setData({
          lastAction: r.ok
            ? { ok: true, text: '已恢复到所选备份' }
            : { ok: false, text: '恢复失败：' + (r.errors || []).join('；') }
        })
        this.refresh()
      }
    })
  },

  clearAll () {
    wx.showModal({
      title: '清空全部数据',
      content: '将删除本机保存的全部记录与目标快照。此操作不可撤销，建议先导出备份。',
      confirmText: '继续',
      confirmColor: '#E85D5D',
      success: res => {
        if (!res.confirm) return
        wx.showModal({
          title: '再次确认',
          content: '确定要清空吗？清空后只能通过导入备份恢复。',
          confirmText: '确认清空',
          confirmColor: '#E85D5D',
          success: r2 => {
            if (!r2.confirm) return
            const r = appStore.getStore().clearAll({ confirm: true })
            this.setData({
              lastAction: r.ok ? { ok: true, text: `已清空 ${r.removed.length} 项本地数据` } : { ok: false, text: '清空失败' }
            })
            this.refresh()
          }
        })
      }
    })
  }
})
