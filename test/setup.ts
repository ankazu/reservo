import { vi } from 'vitest'
import { ref } from 'vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('onScopeDispose', vi.fn())
vi.stubGlobal('defineStore', (_id: string, setup: () => unknown) => setup)
