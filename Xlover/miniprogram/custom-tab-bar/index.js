Component({
  data: {
    selected: 0,
    list: []
  },

  attached() {
    const role = wx.getStorageSync('userRole') || 'main'
    this.updateTabList(role)
  },

  pageLifetimes: {
    show() {
      const role = wx.getStorageSync('userRole') || 'main'
      this.updateTabList(role)
    }
  },

  methods: {
    updateTabList(role) {
      const mainTabs = [
        { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
        { pagePath: '/pages/record/record', text: '记录', icon: '📝' },
        { pagePath: '/pages/progress/progress', text: '进度', icon: '📊' },
        { pagePath: '/pages/message/message', text: '消息', icon: '💬' },
        { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' }
      ]
      const partnerTabs = [
        { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
        { pagePath: '/pages/task/task', text: '任务', icon: '📋' },
        { pagePath: '/pages/progress/progress', text: '进度', icon: '📊' },
        { pagePath: '/pages/message/message', text: '消息', icon: '💬' },
        { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' }
      ]

      const list = role === 'partner' ? partnerTabs : mainTabs
      this.setData({ list })

      // 更新选中态
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      if (currentPage) {
        const path = '/' + currentPage.route
        const idx = list.findIndex(t => t.pagePath === path)
        if (idx !== -1) {
          this.setData({ selected: idx })
        }
      }
    },

    switchTab(e) {
      const idx = e.currentTarget.dataset.index
      const item = this.data.list[idx]
      if (!item) return

      wx.switchTab({ url: item.pagePath })
    }
  }
})