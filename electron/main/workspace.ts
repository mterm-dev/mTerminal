import { createJsonStore } from './json-store'

const store = createJsonStore('workspace', 'workspace.json')

export const setWorkspaceFilePathForTests = store.setFilePathForTests
export const loadWorkspace = store.load
export const saveWorkspace = store.save
export const registerWorkspaceHandlers = store.registerHandlers
