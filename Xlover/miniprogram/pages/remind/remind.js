Page({
  data: {
    userRole: '',
    myReminders: [],
    forPartnerReminders: [],
    fromPartnerReminders: [],
    showAddForm: false,
    addForPartner: false,
    newReminder: {
      name: '',
      icon: '⏰',
      time: '09:00'
    },
    iconList: ['⏰', '💊', '📖', '🎵', '🧘', '☕', '🍎', '🚿', '🦷', '📞', '✅', '🌟'],
    showIconPicker: false
  },

  onShow() {
    this.setData({ userRole: wx.getStorageSync('userRole') || 'main' })
    this.loadReminders()
  },

  async loadReminders() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getReminders' }
      })
      const r = res.result || {}
      this.setData({
        myReminders: r.myReminders || [],
        forPartnerReminders: r.forPartnerReminders || [],
        fromPartnerReminders: r.fromPartnerReminders || []
      })
    } catch (err) {
      console.error('加载提醒设置失败', err)
    }
  },

  toggleReminder(e) {
    const id = e.currentTarget.dataset.id
    const enabled = e.detail.value
    this.updateReminder(id, { enabled })
  },

  bindTimeChange(e) {
    const id = e.currentTarget.dataset.id
    const time = e.detail.value
    this.updateReminder(id, { time })
  },

  updateReminder(id, data) {
    // 乐观更新
    const { myReminders, forPartnerReminders, fromPartnerReminders } = this.data
    const updateList = (list) => list.map(r => r.id === id ? { ...r, ...data } : r)
    this.setData({
      myReminders: updateList(myReminders),
      forPartnerReminders: updateList(forPartnerReminders),
      fromPartnerReminders: updateList(fromPartnerReminders)
    })

    wx.cloud.callFunction({
      name: 'updateData',
      data: { type: 'updateReminder', reminderId: id, ...data }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' })
      this.loadReminders()
    })
  },

  deleteReminder(e) {
    const id = e.currentTarget.dataset.id
    const all = [...this.data.myReminders, ...this.data.forPartnerReminders, ...this.data.fromPartnerReminders]
    const reminder = all.find(r => r.id === id)
    if (!reminder) return
    wx.showModal({
      title: '删除提醒',
      content: `确定删除「${reminder.name}」？`,
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'deleteReminder', reminderId: id }
          }).then((cloudRes) => {
            if (cloudRes.result?.success) {
              // 即时从本地移除，避免等待网络往返
              this.setData({
                myReminders: this.data.myReminders.filter(r => r.id !== id),
                forPartnerReminders: this.data.forPartnerReminders.filter(r => r.id !== id),
                fromPartnerReminders: this.data.fromPartnerReminders.filter(r => r.id !== id)
              })
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadReminders()
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' })
              this.loadReminders()
            }
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  toggleAddForm(e) {
    const forPartner = e?.currentTarget?.dataset?.forPartner || false
    this.setData({
      showAddForm: true,
      addForPartner: forPartner,
      showIconPicker: false,
      newReminder: { name: '', icon: '⏰', time: '09:00' }
    })
  },

  closeAddModal() {
    this.setData({ showAddForm: false, showIconPicker: false })
  },

  preventClose() {
    // 阻止弹窗内容区域点击冒泡
  },

  inputReminderName(e) {
    this.setData({ 'newReminder.name': e.detail.value })
  },

  selectIcon(e) {
    this.setData({ 'newReminder.icon': e.currentTarget.dataset.icon, showIconPicker: false })
  },

  toggleIconPicker() {
    this.setData({ showIconPicker: !this.data.showIconPicker })
  },

  bindNewTimeChange(e) {
    this.setData({ 'newReminder.time': e.detail.value })
  },

  addReminder() {
    const { name, icon, time } = this.data.newReminder
    const { addForPartner } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入提醒名称', icon: 'none' })
      return
    }

    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'addReminder',
        name: name.trim(),
        icon,
        time,
        forPartner: addForPartner
      }
    }).then((res) => {
      if (res.result && res.result.success) {
        wx.showToast({ title: '添加成功', icon: 'success' })
        this.setData({
          showAddForm: false,
          showIconPicker: false,
          newReminder: { name: '', icon: '⏰', time: '09:00' }
        })
        this.loadReminders()
      }
    }).catch(() => {
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  }
})