import { createJsonStore } from './json-store'

const store = createJsonStore('settings', 'settings.json')

export const setSettingsFilePathForTests = store.setFilePathForTests
export const loadSettings = store.load
export const saveSettings = store.save
export const registerSettingsHandlers = store.registerHandlers
