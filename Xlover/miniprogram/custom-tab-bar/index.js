Component({
  data: {
    selected: 0,
    list: []
  },

  attached() {
    this.updateTabList()
  },

  pageLifetimes: {
    show() {
      this.updateTabList()
    }
  },

  methods: {
    updateTabList() {
      // 个人健身工具：今日 / 饮食 / 训练 / 统计 / 我的
      const list = [
        { pagePath: '/pages/index/index', text: '今日', icon: '🏠' },
        { pagePath: '/pages/food/food', text: '饮食', icon: '🍱' },
        { pagePath: '/pages/exercise/exercise', text: '训练', icon: '🏋️' },
        { pagePath: '/pages/progress/progress', text: '统计', icon: '📈' },
        { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' }
      ]

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
