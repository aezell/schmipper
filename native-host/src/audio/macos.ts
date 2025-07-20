import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { AudioController, AudioSource } from './index';
import { getLogger, Logger } from '../logger';

const execAsync = promisify(exec);

interface BrowserProcess {
  pid: number;
  name: string;
  browser: string;
}

export class MacOSAudioController implements AudioController {
  private readonly browserNames = {
    'Brave Browser': 'brave',
    'Google Chrome': 'chrome',
    'Chromium': 'chrome',
    'Firefox': 'firefox',
    'Safari': 'safari'
  };
  private logger: Logger = getLogger();

  async getAudioSources(): Promise<AudioSource[]> {
    return this.logger.timeAsync('getAudioSources', async () => {
      try {
        this.logger.debug('Getting browser processes', undefined, 'MacOSAudioController');
        const browserProcesses = await this.getBrowserProcesses();
        const audioSources: AudioSource[] = [];

        this.logger.debug('Processing browser processes', { 
          processCount: browserProcesses.length 
        }, 'MacOSAudioController');

        for (const process of browserProcesses) {
          try {
            const volume = await this.getProcessVolume(process.pid);
            const source: AudioSource = {
              id: `${process.browser}-${process.pid}`,
              name: `${process.name} (PID: ${process.pid})`,
              processId: process.pid,
              volume: volume,
              isMuted: volume === 0,
              browserType: this.getBrowserType(process.browser)
            };
            audioSources.push(source);
            this.logger.debug('Added audio source', { 
              sourceId: source.id, 
              volume: source.volume 
            }, 'MacOSAudioController');
          } catch (error) {
            // Skip processes that don't have audio or can't be controlled
            this.logger.debug('Skipping process without audio control', { 
              pid: process.pid, 
              error: error instanceof Error ? error.message : String(error) 
            }, 'MacOSAudioController');
          }
        }

        this.logger.info('Retrieved audio sources', { 
          sourceCount: audioSources.length 
        }, 'MacOSAudioController');
        return audioSources;
      } catch (error) {
        this.logger.error('Failed to get audio sources', error, 'MacOSAudioController');
        return [];
      }
    }, 'MacOSAudioController');
  }

  async setVolume(sourceId: string, volume: number): Promise<void> {
    const processId = this.extractProcessId(sourceId);
    if (!processId) {
      throw new Error(`Invalid source ID: ${sourceId}`);
    }

    // Clamp volume between 0 and 100
    const clampedVolume = Math.max(0, Math.min(100, volume));
    
    try {
      // Use AppleScript to control application volume via Audio Unit framework
      const normalizedVolume = clampedVolume / 100;
      const script = `
        tell application "System Events"
          set targetApp to first application process whose unix id is ${processId}
          if exists targetApp then
            -- Get the application name
            set appName to name of targetApp
            
            -- Use osascript to control audio via AudioUnit
            try
              do shell script "osascript -e 'tell application \\"Audio MIDI Setup\\" to set volume output volume of (first audio device whose name contains \\"" & appName & "\\") to " & ${normalizedVolume} & "'"
            on error
              -- Fallback: Use system volume control for the specific app
              tell application appName
                try
                  set sound volume to ${clampedVolume}
                end try
              end tell
            end try
          end if
        end tell
      `;

      await this.executeAppleScript(script);
    } catch (error) {
      this.logger.debug('AppleScript volume control failed, trying direct approach', {
        processId,
        volume: clampedVolume,
        error: error instanceof Error ? error.message : String(error)
      }, 'MacOSAudioController');
      
      // Fallback: Use direct process volume control via system calls
      await this.setProcessVolumeDirectly(processId, clampedVolume);
    }
  }

  async getVolume(sourceId: string): Promise<number> {
    const processId = this.extractProcessId(sourceId);
    if (!processId) {
      throw new Error(`Invalid source ID: ${sourceId}`);
    }

    return await this.getProcessVolume(processId);
  }

  async setMute(sourceId: string, muted: boolean): Promise<void> {
    if (muted) {
      await this.setVolume(sourceId, 0);
    } else {
      // If unmuting, restore to 50% volume as default
      await this.setVolume(sourceId, 50);
    }
  }

  async getBrowserProcesses(): Promise<BrowserProcess[]> {
    try {
      // Get all running processes and filter for browsers
      const { stdout } = await execAsync('ps -eo pid,comm | grep -E "(Brave|Chrome|Firefox|Safari)"');
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      
      const processes: BrowserProcess[] = [];
      
      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          const pid = parseInt(match[1]);
          const name = match[2].trim();
          
          // Map process name to browser type
          const browserType = this.mapProcessNameToBrowser(name);
          if (browserType !== 'unknown') {
            processes.push({
              pid,
              name,
              browser: browserType
            });
          }
        }
      }

      return processes;
    } catch (error) {
      console.error('Failed to get browser processes:', error);
      return [];
    }
  }

  private async getProcessVolume(processId: number): Promise<number> {
    try {
      // Use AppleScript to get application volume
      const script = `
        tell application "System Events"
          set targetApp to first application process whose unix id is ${processId}
          if exists targetApp then
            set appName to name of targetApp
            tell application appName
              try
                return sound volume
              on error
                return 50
              end try
            end tell
          else
            return 50
          end if
        end tell
      `;
      
      const result = await this.executeAppleScript(script);
      const volume = parseInt(result.trim()) || 50;
      return Math.max(0, Math.min(100, volume));
    } catch (error) {
      this.logger.debug('Failed to get process volume', {
        processId,
        error: error instanceof Error ? error.message : String(error)
      }, 'MacOSAudioController');
      // Fallback: assume volume is 50% if we can't detect it
      return 50;
    }
  }

  private async setProcessVolumeDirectly(processId: number, volume: number): Promise<void> {
    try {
      // Use system audio session control via shell commands
      const script = `
        # Get the application name from process ID
        APP_NAME=$(ps -p ${processId} -o comm= | sed 's/.*\\///')
        
        # Use SwitchAudioSource to control application-specific audio
        if command -v SwitchAudioSource >/dev/null 2>&1; then
          # If SwitchAudioSource is available, use it for app-specific control
          SwitchAudioSource -t input -c "System Audio" -a "$APP_NAME" -v ${volume}
        else
          # Fallback: Use osascript for basic volume control
          osascript -e "set volume output volume ${volume}"
        fi
      `;
      
      await execAsync(script);
    } catch (error) {
      this.logger.warn('Direct volume control failed', {
        processId,
        volume,
        error: error instanceof Error ? error.message : String(error)
      }, 'MacOSAudioController');
      
      // Final fallback: store volume state for content script to handle
      throw new Error(`System-level volume control not available for process ${processId}. Volume will be controlled at browser level.`);
    }
  }

  private async executeAppleScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const osascript = spawn('osascript', ['-e', script]);
      let output = '';
      let error = '';

      osascript.stdout.on('data', (data) => {
        output += data.toString();
      });

      osascript.stderr.on('data', (data) => {
        error += data.toString();
      });

      osascript.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`AppleScript failed: ${error}`));
        }
      });
    });
  }

  private extractProcessId(sourceId: string): number | null {
    const match = sourceId.match(/-(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }

  private mapProcessNameToBrowser(processName: string): string {
    for (const [name, browser] of Object.entries(this.browserNames)) {
      if (processName.includes(name) || processName.toLowerCase().includes(browser)) {
        return browser;
      }
    }
    return 'unknown';
  }

  private getBrowserType(browser: string): 'chrome' | 'brave' | 'firefox' | 'safari' | 'unknown' {
    switch (browser.toLowerCase()) {
      case 'brave':
        return 'brave';
      case 'chrome':
      case 'chromium':
        return 'chrome';
      case 'firefox':
        return 'firefox';
      case 'safari':
        return 'safari';
      default:
        return 'unknown';
    }
  }
}
