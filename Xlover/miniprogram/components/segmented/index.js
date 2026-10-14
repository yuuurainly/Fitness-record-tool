Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    disabled: { type: Boolean, value: false }
  },

  methods: {
    onTap (e) {
      if (this.data.disabled) return
      const value = e.currentTarget.dataset.value
      if (value === this.data.value) return
      this.triggerEvent('change', { value })
    }
  }
})
