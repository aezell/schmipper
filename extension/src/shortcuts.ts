// Keyboard shortcuts management for Browser Volume Controller
// Handles shortcut registration, customization, and persistence

export interface ShortcutCommand {
  id: string;
  description: string;
  defaultKey: string;
  customKey?: string;
  enabled: boolean;
  category: 'core' | 'advanced';
}

export interface ShortcutAction {
  command: string;
  params?: any;
}

export class ShortcutsManager {
  private shortcuts: Map<string, ShortcutCommand> = new Map();
  private actionHandlers: Map<string, (params?: any) => Promise<void>> = new Map();

  // Default shortcuts configuration - Chrome Extensions API limits us to 4 global shortcuts
  private readonly defaultShortcuts: ShortcutCommand[] = [
    {
      id: 'mute-all',
      description: 'Mute/unmute all audio sources',
      defaultKey: 'Ctrl+Shift+M',
      enabled: true,
      category: 'core'
    },
    {
      id: 'volume-up-all',
      description: 'Volume up for all sources (+10%)',
      defaultKey: 'Ctrl+Shift+Up',
      enabled: true,
      category: 'core'
    },
    {
      id: 'volume-down-all',
      description: 'Volume down for all sources (-10%)',
      defaultKey: 'Ctrl+Shift+Down',
      enabled: true,
      category: 'core'
    },
    {
      id: 'reset-volumes',
      description: 'Reset all volumes to 50%',
      defaultKey: 'Ctrl+Shift+R',
      enabled: true,
      category: 'core'
    }
  ];

  constructor() {
    this.initializeShortcuts();
    this.setupActionHandlers();
  }

  private async initializeShortcuts(): Promise<void> {
    // Load custom shortcuts from storage
    const stored = await this.loadStoredShortcuts();
    
    // Initialize shortcuts map with defaults, overridden by stored values
    this.defaultShortcuts.forEach(shortcut => {
      const storedShortcut = stored.find(s => s.id === shortcut.id);
      if (storedShortcut) {
        this.shortcuts.set(shortcut.id, { ...shortcut, ...storedShortcut });
      } else {
        this.shortcuts.set(shortcut.id, { ...shortcut });
      }
    });

    // Register all enabled shortcuts with Chrome
    await this.registerChromeCommands();
  }

  private async loadStoredShortcuts(): Promise<Partial<ShortcutCommand>[]> {
    try {
      const result = await chrome.storage.local.get(['customShortcuts']);
      return result.customShortcuts || [];
    } catch (error) {
      return [];
    }
  }

  private async saveShortcuts(): Promise<void> {
    try {
      const customShortcuts = Array.from(this.shortcuts.values())
        .filter(shortcut => shortcut.customKey || !shortcut.enabled)
        .map(shortcut => ({
          id: shortcut.id,
          customKey: shortcut.customKey,
          enabled: shortcut.enabled
        }));

      await chrome.storage.local.set({ customShortcuts });
    } catch (error) {
    }
  }

  private async registerChromeCommands(): Promise<void> {
    // Chrome Extensions API doesn't support dynamic command registration
    // Commands must be defined in manifest.json
    // This method is a placeholder for future Chrome API enhancements
  }

  private setupActionHandlers(): void {
    // Core actions
    this.actionHandlers.set('mute-all', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-mute-all' });
      this.showFeedback('🔇 Toggled mute for all sources');
    });

    this.actionHandlers.set('volume-up-all', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-volume-all', delta: 10 });
      this.showFeedback('🔊 Volume up +10%');
    });

    this.actionHandlers.set('volume-down-all', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-volume-all', delta: -10 });
      this.showFeedback('🔉 Volume down -10%');
    });

    this.actionHandlers.set('cycle-modes', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-cycle-modes' });
      this.showFeedback('🔄 Cycled volume modes');
    });

    this.actionHandlers.set('reset-volumes', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-reset-volumes' });
      this.showFeedback('⚖️ Reset all volumes to 50%');
    });

    this.actionHandlers.set('focus-mode', async () => {
      await this.sendBackgroundMessage({ action: 'shortcut-focus-mode' });
      this.showFeedback('🎯 Focus mode activated');
    });

    // Individual tab control actions
    for (let i = 1; i <= 5; i++) {
      this.actionHandlers.set(`control-tab-${i}`, async () => {
        await this.sendBackgroundMessage({ action: 'shortcut-tab-control', tabIndex: i - 1 });
        this.showFeedback(`🎵 Controlling tab ${i}`);
      });
    }
  }

  public async handleCommand(commandId: string): Promise<void> {
    const shortcut = this.shortcuts.get(commandId);
    if (!shortcut || !shortcut.enabled) {
      return;
    }

    const handler = this.actionHandlers.get(commandId);
    if (handler) {
      try {
        await handler();
      } catch (error) {
        this.showFeedback(`❌ Error executing ${shortcut.description}`);
      }
    }
  }

  public getShortcuts(): ShortcutCommand[] {
    return Array.from(this.shortcuts.values());
  }

  public getShortcutsByCategory(category: 'core' | 'advanced'): ShortcutCommand[] {
    return this.getShortcuts().filter(shortcut => shortcut.category === category);
  }

  public async updateShortcut(id: string, updates: Partial<ShortcutCommand>): Promise<boolean> {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return false;

    const updated = { ...shortcut, ...updates };
    this.shortcuts.set(id, updated);
    await this.saveShortcuts();
    return true;
  }

  public async resetShortcut(id: string): Promise<boolean> {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return false;

    const defaultShortcut = this.defaultShortcuts.find(s => s.id === id);
    if (!defaultShortcut) return false;

    this.shortcuts.set(id, { ...defaultShortcut });
    await this.saveShortcuts();
    return true;
  }

  public getActiveKey(shortcut: ShortcutCommand): string {
    return shortcut.customKey || shortcut.defaultKey;
  }

  public validateShortcutKey(key: string): boolean {
    // Basic validation for Chrome extension shortcuts
    const validModifiers = /^(Ctrl|Alt|Shift|Command|MacCtrl)\+/;
    const validKeys = /[A-Z0-9]$|Tab$|Up$|Down$|Left$|Right$/;
    
    return validModifiers.test(key) && validKeys.test(key);
  }

  private async sendBackgroundMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  private showFeedback(_message: string): void {
    // Show visual feedback through badge or notification
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }

  // Generate manifest commands configuration
  public static generateManifestCommands(): Record<string, any> {
    const shortcuts = new ShortcutsManager();
    const commands: Record<string, any> = {};

    shortcuts.defaultShortcuts.forEach(shortcut => {
      if (shortcut.enabled) {
        commands[shortcut.id] = {
          suggested_key: {
            default: shortcut.defaultKey,
            mac: shortcut.defaultKey.replace('Ctrl+', 'Command+')
          },
          description: shortcut.description
        };
      }
    });

    return commands;
  }
}

export default ShortcutsManager;
