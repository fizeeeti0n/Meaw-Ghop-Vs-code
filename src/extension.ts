import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Output channel
// ---------------------------------------------------------------------------
let outputChannel: vscode.OutputChannel;
function log(msg: string) {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function cfg<T>(key: string): T {
  return vscode.workspace.getConfiguration('terminalErrorSound').get<T>(key)!;
}

// ---------------------------------------------------------------------------
// Sound — plays entirely via OS, no webview, no UI panels
// ---------------------------------------------------------------------------
function getSoundPath(context: vscode.ExtensionContext): string {
  const custom = cfg<string>('soundFile');
  if (custom && fs.existsSync(custom)) {
    const ext = path.extname(custom).toLowerCase();
    if (ext === '.wav' || ext === '.mp3') { return custom; }
    log(`Unsupported extension ${ext}, using default.`);
  } else if (custom) {
    log(`Sound file not found: ${custom}, using default.`);
  }
  return context.asAbsolutePath(path.join('media', 'default-error.wav'));
}

function playSound(filePath: string, volume: number): void {
  log(`Playing: ${filePath} (vol=${volume})`);
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      // macOS — afplay is always present, supports volume natively
      cp.spawn('afplay', ['-v', String(Math.min(1, Math.max(0, volume))), filePath], {
        detached: true, stdio: 'ignore'
      }).unref();

    } else if (platform === 'win32') {
      // Windows — use a VBScript file to play the WAV via Windows WScript shell.
      // VBScript's SoundPlayer runs in its own process with its own audio channel,
      // completely independent of PowerShell or VS Code's mixer entry.
      // Volume control: use wscript with mmsystem via rundll32 for WAV, or
      // Windows built-in Media.SoundPlayer via a temp VBS file.
      const vbsContent = `
Dim snd
Set snd = CreateObject("WMPlayer.OCX.7")
snd.settings.volume = ${Math.round(volume * 100)}
snd.URL = "${filePath.replace(/\\/g, '\\\\')}"
snd.controls.play()
WScript.Sleep 10000
`;
      const tmpVbs = path.join(os.tmpdir(), `_tes_${Date.now()}.vbs`);
      fs.writeFileSync(tmpVbs, vbsContent, 'utf8');

      const proc = cp.spawn('wscript.exe', ['//NoLogo', '//B', tmpVbs], {
        detached: true, stdio: 'ignore'
      });
      proc.unref();

      // Clean up temp file after a few seconds
      setTimeout(() => {
        try { fs.unlinkSync(tmpVbs); } catch {}
      }, 6000);

    } else {
      // Linux — try players in order
      const vol100 = Math.round(volume * 100);
      const attempts = [
        ['paplay', ['--volume=' + Math.round(volume * 65536), filePath]],
        ['aplay', [filePath]],
        ['ffplay', ['-nodisp', '-autoexit', '-volume', String(vol100), filePath]],
        ['mpg123', ['-q', filePath]],
        ['cvlc', ['--play-and-exit', filePath]],
      ] as [string, string[]][];

      let launched = false;
      for (const [cmd, args] of attempts) {
        try {
          cp.spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
          log(`Linux audio: using ${cmd}`);
          launched = true;
          break;
        } catch { /* not found, try next */ }
      }
      if (!launched) {
        log('No audio player found. Install paplay or aplay.');
        vscode.window.showWarningMessage('Terminal Error Sound: No audio player found on Linux. Install paplay or aplay.');
      }
    }
  } catch (err) {
    log(`playSound error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Error patterns
// ---------------------------------------------------------------------------
const BUILTIN_PATTERNS: RegExp[] = [
  /command\s+not\s+found/i,
  /not\s+recognized\s+as\s+an?\s+(internal|external)/i,
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bfatal\b/i,
  /\bpermission\s+denied\b/i,
  /no\s+such\s+file\s+or\s+directory/i,
  /\bsyntaxerror\b/i,
  /\btraceback\b/i,
  /npm\s+ERR!/,
  /Cannot\s+find\s+module/i,
];

function getPatterns(): RegExp[] {
  const custom = cfg<string[]>('customPatterns') ?? [];
  const extras = custom.map(p => { try { return new RegExp(p, 'i'); } catch { return null; } })
    .filter(Boolean) as RegExp[];
  return [...BUILTIN_PATTERNS, ...extras];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let statusBar: vscode.StatusBarItem;
let lastPlayed = 0;
let extContext: vscode.ExtensionContext;

function updateStatusBar() {
  const on = cfg<boolean>('enabled');
  statusBar.text = on ? '$(unmute) Error Sound' : '$(mute) Error Sound';
  statusBar.tooltip = on ? 'Terminal Error Sound ON — click to disable' : 'Terminal Error Sound OFF — click to enable';
  statusBar.command = on ? 'terminalErrorSound.disable' : 'terminalErrorSound.enable';
}

function trigger(reason: string) {
  if (!cfg<boolean>('enabled')) { return; }
  const now = Date.now();
  const cooldown = cfg<number>('cooldownMs') ?? 2000;
  if (now - lastPlayed < cooldown) {
    log(`Cooldown active, skipping. (reason: ${reason})`);
    return;
  }
  lastPlayed = now;
  log(`Triggered! Reason: ${reason}`);
  playSound(getSoundPath(extContext), cfg<number>('volume') ?? 0.8);
}

// ---------------------------------------------------------------------------
// Terminal listeners
// ---------------------------------------------------------------------------
function registerListeners(context: vscode.ExtensionContext) {
  // Exit-code detection via shell integration (best method)
  const win = vscode.window as any;
  if (typeof win.onDidEndTerminalShellExecution === 'function') {
    context.subscriptions.push(
      win.onDidEndTerminalShellExecution((e: any) => {
        const code = e?.exitCode;
        log(`Command finished, exit code: ${code}`);
        if (code !== undefined && code !== null && code !== 0 && cfg<boolean>('useExitCodeDetection')) {
          trigger(`exit code ${code}`);
        }
      })
    );
    log('Exit-code listener registered.');
  }

  // Pattern detection fallback
  if (typeof win.onDidWriteTerminalData === 'function') {
    context.subscriptions.push(
      win.onDidWriteTerminalData((e: any) => {
        if (!cfg<boolean>('usePatternDetection')) { return; }
        const data: string = e?.data ?? '';
        if (!data) { return; }
        for (const re of getPatterns()) {
          if (re.test(data)) {
            log(`Pattern matched: ${re.source}`);
            trigger(`pattern match`);
            return;
          }
        }
      })
    );
    log('Pattern listener registered.');
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('terminalErrorSound.testSound', () => {
      log('Test sound triggered.');
      playSound(getSoundPath(context), cfg<number>('volume') ?? 0.8);
      vscode.window.showInformationMessage('Terminal Error Sound: Testing…');
    }),
    vscode.commands.registerCommand('terminalErrorSound.enable', async () => {
      await vscode.workspace.getConfiguration('terminalErrorSound')
        .update('enabled', true, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      vscode.window.showInformationMessage('Terminal Error Sound: Enabled ✔');
    }),
    vscode.commands.registerCommand('terminalErrorSound.disable', async () => {
      await vscode.workspace.getConfiguration('terminalErrorSound')
        .update('enabled', false, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      vscode.window.showInformationMessage('Terminal Error Sound: Disabled ✖');
    }),
    vscode.commands.registerCommand('terminalErrorSound.setSoundFile', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Select Sound File (.wav or .mp3)',
        filters: { 'Audio': ['wav', 'mp3'] }
      });
      if (!uris?.length) { return; }
      await vscode.workspace.getConfiguration('terminalErrorSound')
        .update('soundFile', uris[0].fsPath, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Sound set to: ${uris[0].fsPath}`);
    })
  );
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  outputChannel = vscode.window.createOutputChannel('Terminal Error Sound');
  context.subscriptions.push(outputChannel);
  log('Activating…');

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar);
  updateStatusBar();
  statusBar.show();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('terminalErrorSound')) { updateStatusBar(); }
    })
  );

  registerCommands(context);
  registerListeners(context);
  log('Ready. Default sound: ' + context.asAbsolutePath('media/default-error.wav'));
}

export function deactivate() {}