# Terminal Error Sound

A VS Code extension that plays a customizable sound whenever a terminal command
fails (exits with a non-zero code or matches common error patterns).

---

## Features

- 🔊 **Automatic error detection** via shell integration exit codes (preferred)
  and/or text-pattern matching as a fallback
- 🐚 **Works with** bash, zsh, PowerShell, and Windows cmd
- 🎵 **Custom sounds** – use any `.wav` or `.mp3` file
- 🔇 **Cooldown timer** – prevents repeated sounds within a configurable window
  (default: 2 seconds)
- 📊 **Status bar indicator** – shows enabled/disabled state; click to toggle
- 🪵 **Logging** – detailed debug output in the *Terminal Error Sound* Output panel

---

## Requirements

| Platform | Required binary |
|----------|----------------|
| macOS | `afplay` (built-in) |
| Linux | `paplay`, `aplay`, `ffplay`, or `mpg123` |
| Windows | PowerShell (built-in) |

---

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminalErrorSound.enabled` | boolean | `true` | Enable or disable the extension |
| `terminalErrorSound.soundFile` | string | `""` | Absolute path to custom `.wav` or `.mp3`. Empty = bundled default. |
| `terminalErrorSound.volume` | number | `0.8` | Volume (0.0 – 1.0) |
| `terminalErrorSound.cooldownMs` | number | `2000` | Minimum ms between triggers |
| `terminalErrorSound.useExitCodeDetection` | boolean | `true` | Detect failures via exit code |
| `terminalErrorSound.usePatternDetection` | boolean | `true` | Detect failures via text patterns |
| `terminalErrorSound.customPatterns` | string[] | `[]` | Extra regex patterns for error detection |

### Example `settings.json`

```json
"terminalErrorSound.enabled": true,
"terminalErrorSound.soundFile": "/home/alice/sounds/error.wav",
"terminalErrorSound.volume": 0.8,
"terminalErrorSound.cooldownMs": 2000,
"terminalErrorSound.customPatterns": ["\\bABORTED\\b", "SIGKILL"]
```

---

## Commands (Command Palette)

| Command | Description |
|---------|-------------|
| `Terminal Error Sound: Test Sound` | Play the configured sound immediately |
| `Terminal Error Sound: Enable` | Enable the extension globally |
| `Terminal Error Sound: Disable` | Disable the extension globally |
| `Terminal Error Sound: Set Sound File` | Open a file picker to choose a custom sound |

---

## How Error Detection Works

### 1. Exit-Code Detection (preferred)
VS Code's **shell integration** feature automatically injects hooks into
bash/zsh/PowerShell/cmd that report exit codes after each command. When this is
active, `onDidEndTerminalShellExecution` fires with `exitCode`. Any value ≠ 0 is
treated as a failure.

Shell integration is enabled by default in VS Code ≥ 1.85 for the supported
shells. If a shell doesn't report codes, the extension falls back to pattern
detection.

### 2. Pattern Detection (fallback)
Scans raw terminal output for these built-in patterns (and any custom ones you
add):

- `command not found`
- `not recognized as an internal or external`
- `error`
- `failed`
- `exception`
- `fatal`
- `permission denied`
- `no such file or directory`
- `SyntaxError`, `Traceback`
- `npm ERR!`
- `Cannot find module`

---

## Installation & Development

### Install dependencies

```bash
cd terminal-error-sound
npm install
```

### Run in VS Code (F5)

1. Open the `terminal-error-sound` folder in VS Code.
2. Press **F5** (or *Run → Start Debugging*).
3. An **Extension Development Host** window opens with the extension loaded.
4. Open a terminal in that window and run a failing command (e.g. `false`
   in bash/zsh, or `exit 1` in PowerShell).

### Package with vsce

```bash
# Install vsce if needed
npm install -g @vscode/vsce

# Package
vsce package

# This produces terminal-error-sound-1.0.0.vsix
# Install locally:
code --install-extension terminal-error-sound-1.0.1.vsix
```

> **Note:** You must set a valid `publisher` in `package.json` before publishing
> to the VS Code Marketplace.

---

## Troubleshooting

- Open the **Output** panel (*View → Output*) and select **Terminal Error Sound**
  to see detailed logs.
- If no sound plays on Linux, ensure one of `paplay`, `aplay`, `ffplay`, or
  `mpg123` is installed.
- If exit-code detection isn't firing, check that VS Code shell integration is
  active: run `echo $VSCODE_SHELL_INTEGRATION` in the terminal (should not be
  empty for bash/zsh).

---

## License

MIT
