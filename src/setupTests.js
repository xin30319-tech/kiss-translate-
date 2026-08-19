// Polyfills for Jest environment
if (typeof globalThis.chrome === "undefined") {
  globalThis.chrome = {
    runtime: {
      id: "mock-extension-id",
      getURL: (path) => `chrome-extension://mock-id/${path}`,
      sendMessage: jest.fn().mockResolvedValue({}),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      connect: jest.fn().mockReturnValue({
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
        disconnect: jest.fn(),
      }),
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(),
        remove: jest.fn().mockResolvedValue(),
        clear: jest.fn().mockResolvedValue(),
      },
      sync: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(),
        remove: jest.fn().mockResolvedValue(),
        clear: jest.fn().mockResolvedValue(),
      },
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
    tabs: {
      create: jest.fn(),
      sendMessage: jest.fn(),
    },
    commands: {
      getAll: jest.fn().mockResolvedValue([]),
    },
  };
}

if (typeof globalThis.browser === "undefined") {
  globalThis.browser = globalThis.chrome;
}

if (typeof globalThis.PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId || 0;
      this.width = params.width || 1;
      this.height = params.height || 1;
      this.pressure = params.pressure || 0;
      this.tangentialPressure = params.tangentialPressure || 0;
      this.tiltX = params.tiltX || 0;
      this.tiltY = params.tiltY || 0;
      this.twist = params.twist || 0;
      this.pointerType = params.pointerType || "mouse";
      this.isPrimary = params.isPrimary || false;
    }
  };
}
