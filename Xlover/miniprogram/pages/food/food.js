const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    todayCalories: 0,
    targetCalories: 1500,
    caloriesStatus: '',
    searchKey: '',
    foodList: [],
    showFoodList: 3,
    expandFoodList: false,
    customFood: {
      name: '',
      calories: '',
      amount: ''
    },
    expandCustom: false,
    meals: ['早餐', '午餐', '晚餐', '加餐'],
    mealIndex: 0,
    todayFoodLogs: [],
    showModal: false,
    selectedFood: {},
    inputAmount: ''
  },

  onShow() {
    this.loadFoodLogs()
    this.loadFoodLibrary()
  },

  async loadFoodLogs() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getFoodLogs' }
      })

      if (res.result) {
        this.setData({
          todayCalories: res.result.todayCalories || 0,
          targetCalories: res.result.targetCalories || 1500,
          todayFoodLogs: res.result.foodLogs || []
        })
        this.checkCaloriesStatus()
      }
    } catch (err) {
      console.error('加载饮食记录失败', err)
    }
  },

  checkCaloriesStatus() {
    const { todayCalories, targetCalories } = this.data
    this.setData({
      caloriesStatus: todayCalories > targetCalories ? 'over' : ''
    })
  },

  async loadFoodLibrary() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getFoodLibrary' }
      })

      if (res.result) {
        this.setData({ foodList: res.result.foods || [], expandFoodList: false, showFoodList: 3 })
      }
    } catch (err) {
      console.error('加载食物库失败', err)
    }
  },

  toggleFoodList() {
    const { expandFoodList, foodList } = this.data
    this.setData({
      expandFoodList: !expandFoodList,
      showFoodList: expandFoodList ? 3 : foodList.length
    })
  },

  toggleCustom() {
    this.setData({ expandCustom: !this.data.expandCustom })
  },

  onSearch: util.debounce(function(e) {
    const key = e.detail.value
    this.setData({ searchKey: key })

    if (key) {
      wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'searchFood', keyword: key }
      }).then(res => {
        this.setData({ foodList: res.result.foods || [] })
      })
    } else {
      this.loadFoodLibrary()
    }
  }, 400),

  selectFood(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      selectedFood: item,
      showModal: true,
      inputAmount: ''
    })
  },

  closeModal() {
    this.setData({ showModal: false })
  },

  inputAmount(e) {
    this.setData({ inputAmount: e.detail.value })
  },

  bindMealChange(e) {
    this.setData({ mealIndex: parseInt(e.detail.value) })
  },

  confirmAddFood() {
    const { selectedFood, inputAmount, meals, mealIndex } = this.data
    const amount = parseFloat(inputAmount)
    
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入摄入量', icon: 'none' })
      return
    }

    this.addFoodRecord({
      name: selectedFood.name,
      calories: selectedFood.calories,
      amount,
      meal: meals[mealIndex]
    })
  },

  inputCustomName(e) {
    this.setData({ 'customFood.name': e.detail.value })
  },

  inputCustomCalories(e) {
    this.setData({ 'customFood.calories': e.detail.value })
  },

  inputCustomAmount(e) {
    this.setData({ 'customFood.amount': e.detail.value })
  },

  addCustomFood() {
    const { customFood, meals, mealIndex } = this.data
    
    if (!customFood.name || !customFood.calories || !customFood.amount) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    this.addFoodRecord({
      name: customFood.name,
      calories: parseFloat(customFood.calories),
      amount: parseFloat(customFood.amount),
      meal: meals[mealIndex],
      isCustom: true
    })
  },

  addFoodRecord(data) {
    wx.showLoading({ title: '添加中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'addFoodLog',
        ...data
      }
    }).then(() => {
      wx.hideLoading()
      this.setData({
        showModal: false,
        customFood: { name: '', calories: '', amount: '' },
        inputAmount: ''
      })
      this.loadFoodLogs()
      wx.showToast({ title: '添加成功', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  deleteFoodLog(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'deleteFoodLog', id }
          }).then(() => {
            this.loadFoodLogs()
          })
        }
      }
    })
  }
})
