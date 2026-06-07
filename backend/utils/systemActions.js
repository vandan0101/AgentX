import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const runCommand = async (command, args) => execFileAsync(command, args);

const runPowerShell = async (script) =>
  runCommand("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);

const runAppleScript = async (...lines) => {
  const args = lines.flatMap((line) => ["-e", line]);
  await runCommand("osascript", args);
};

const revealSystemSettingsPane = async (paneId) => {
  await runCommand("osascript", [
    "-e",
    `tell application "System Settings" to reveal pane id "${paneId}"`,
    "-e",
    'tell application "System Settings" to activate',
  ]);
};

const openSystemSettings = async () => {
  await runCommand("open", ["/System/Applications/System Settings.app"]);
};

const findMacWifiService = async () => {
  try {
    const { stdout } = await runCommand("/usr/sbin/networksetup", ["-listallnetworkservices"]);
    const service = stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line === "Wi-Fi" || line === "WiFi");

    return service || "Wi-Fi";
  } catch {
    return "Wi-Fi";
  }
};

const toggleMacWifiPower = async (enabled) => {
  const wifiService = await findMacWifiService();
  await runCommand("/usr/sbin/networksetup", [
    "-setairportpower",
    wifiService,
    enabled ? "on" : "off",
  ]);
};

const getBlueutilPath = async () => {
  const { stdout } = await runCommand("which", ["blueutil"]);
  return stdout.trim();
};

const toggleMacBluetoothPower = async (enabled) => {
  const blueutilPath = await getBlueutilPath();
  if (!blueutilPath) {
    throw new Error("blueutil-missing");
  }

  await runCommand(blueutilPath, ["--power", enabled ? "1" : "0"]);
};

const adjustMacVolume = async (delta) => {
  await runAppleScript(
    'set currentVolume to output volume of (get volume settings)',
    `set newVolume to currentVolume + (${delta})`,
    'if newVolume > 100 then set newVolume to 100',
    'if newVolume < 0 then set newVolume to 0',
    'set volume output volume newVolume'
  );
};

const setMacVolume = async (value) => {
  await runAppleScript(`set volume output volume ${value}`);
};

const setMacMuted = async (muted) => {
  await runAppleScript(muted ? "set volume with output muted" : "set volume without output muted");
};

const pressMacBrightnessKey = async (keyCode, times = 1) => {
  const safeTimes = Math.max(1, Number(times) || 1);
  for (let i = 0; i < safeTimes; i += 1) {
    await runAppleScript(`tell application "System Events" to key code ${keyCode}`);
  }
};

const openWindowsUri = async (uri) => {
  await runCommand("cmd", ["/c", "start", "", uri]);
};

const getWindowsWifiAdapter = async () => {
  const script =
    "$adapter = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'Wireless|Wi-Fi|802.11' -or $_.Name -match 'Wi-Fi|WiFi|Wireless' } | Select-Object -First 1 -ExpandProperty Name; " +
    "if (-not $adapter) { $adapter = 'Wi-Fi' }; " +
    "Write-Output $adapter";
  const { stdout } = await runPowerShell(script);
  return stdout.trim() || "Wi-Fi";
};

const toggleWindowsWifiPower = async (enabled) => {
  const wifiAdapter = await getWindowsWifiAdapter();
  await runCommand("netsh", [
    "interface",
    "set",
    "interface",
    `name=${wifiAdapter}`,
    `admin=${enabled ? "ENABLED" : "DISABLED"}`,
  ]);
};

const toggleWindowsBluetoothPower = async (enabled) => {
  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime]
$null = [Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime]
$null = [Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1
} | Select-Object -First 1)
function Await($operation, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1)
  return $task.Result
}
$access = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
if ($access -ne [Windows.Devices.Radios.RadioAccessStatus]::Allowed) {
  throw 'windows-radio-access-denied'
}
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$bluetooth = $radios | Where-Object { $_.Kind -eq [Windows.Devices.Radios.RadioKind]::Bluetooth } | Select-Object -First 1
if (-not $bluetooth) {
  throw 'windows-bluetooth-not-found'
}
$targetState = [Windows.Devices.Radios.RadioState]::${enabled ? "On" : "Off"}
$status = Await ($bluetooth.SetStateAsync($targetState)) ([Windows.Devices.Radios.RadioAccessStatus])
if ($status -ne [Windows.Devices.Radios.RadioAccessStatus]::Allowed) {
  throw 'windows-bluetooth-toggle-failed'
}
`;

  await runPowerShell(script);
};

const adjustWindowsVolume = async (virtualKeyCode, times = 1) => {
  const repeat = Math.max(1, Number(times) || 1);
  const script = `
$wshell = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt ${repeat}; $i++) {
  $wshell.SendKeys([char]${virtualKeyCode})
}
`;
  await runPowerShell(script);
};

const setWindowsMuted = async () => {
  await adjustWindowsVolume(173, 1);
};

const setWindowsBrightness = async (targetLevel) => {
  const bounded = Math.max(0, Math.min(100, Number(targetLevel) || 0));
  const script = `
$methods = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods
if (-not $methods) { throw 'windows-brightness-not-supported' }
$methods | ForEach-Object { $_.WmiSetBrightness(1, ${bounded}) }
`;
  await runPowerShell(script);
};

const adjustWindowsBrightness = async (delta) => {
  const script = `
$current = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness | Select-Object -First 1 -ExpandProperty CurrentBrightness)
if ($null -eq $current) { throw 'windows-brightness-not-supported' }
$target = [Math]::Max(0, [Math]::Min(100, $current + (${delta})))
$methods = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods
if (-not $methods) { throw 'windows-brightness-not-supported' }
$methods | ForEach-Object { $_.WmiSetBrightness(1, $target) }
`;
  await runPowerShell(script);
};

const macActions = {
  "bluetooth-open": async () => {
    await revealSystemSettingsPane("com.apple.BluetoothSettings");
    return "opening bluetooth settings";
  },
  "bluetooth-on": async () => {
    await toggleMacBluetoothPower(true);
    return "turning bluetooth on";
  },
  "bluetooth-off": async () => {
    await toggleMacBluetoothPower(false);
    return "turning bluetooth off";
  },
  "wifi-open": async () => {
    await revealSystemSettingsPane("com.apple.Network-Settings.extension");
    return "opening wifi settings";
  },
  "wifi-on": async () => {
    await toggleMacWifiPower(true);
    return "turning wifi on";
  },
  "wifi-off": async () => {
    await toggleMacWifiPower(false);
    return "turning wifi off";
  },
  "settings-open": async () => {
    await openSystemSettings();
    return "opening system settings";
  },
  "volume-settings-open": async () => {
    await revealSystemSettingsPane("com.apple.Sound-Settings.extension");
    return "opening sound settings";
  },
  "volume-up": async () => {
    await adjustMacVolume(12);
    return "increasing volume";
  },
  "volume-down": async () => {
    await adjustMacVolume(-12);
    return "decreasing volume";
  },
  "volume-mute": async () => {
    await setMacMuted(true);
    return "muting volume";
  },
  "volume-unmute": async () => {
    await setMacMuted(false);
    return "unmuting volume";
  },
  "volume-max": async () => {
    await setMacMuted(false);
    await setMacVolume(100);
    return "setting volume to maximum";
  },
  "volume-min": async () => {
    await setMacVolume(0);
    return "setting volume to minimum";
  },
  "display-settings-open": async () => {
    await revealSystemSettingsPane("com.apple.Displays-Settings.extension");
    return "opening display settings";
  },
  "brightness-up": async () => {
    await pressMacBrightnessKey(144, 2);
    return "increasing brightness";
  },
  "brightness-down": async () => {
    await pressMacBrightnessKey(145, 2);
    return "decreasing brightness";
  },
  "brightness-max": async () => {
    await pressMacBrightnessKey(144, 16);
    return "setting brightness to maximum";
  },
  "brightness-min": async () => {
    await pressMacBrightnessKey(145, 16);
    return "setting brightness to minimum";
  },
};

const windowsActions = {
  "bluetooth-open": async () => {
    await openWindowsUri("ms-settings:bluetooth");
    return "opening bluetooth settings";
  },
  "bluetooth-on": async () => {
    await toggleWindowsBluetoothPower(true);
    return "turning bluetooth on";
  },
  "bluetooth-off": async () => {
    await toggleWindowsBluetoothPower(false);
    return "turning bluetooth off";
  },
  "wifi-open": async () => {
    await openWindowsUri("ms-settings:network-wifi");
    return "opening wifi settings";
  },
  "wifi-on": async () => {
    await toggleWindowsWifiPower(true);
    return "turning wifi on";
  },
  "wifi-off": async () => {
    await toggleWindowsWifiPower(false);
    return "turning wifi off";
  },
  "settings-open": async () => {
    await openWindowsUri("ms-settings:");
    return "opening system settings";
  },
  "volume-settings-open": async () => {
    await openWindowsUri("ms-settings:sound");
    return "opening sound settings";
  },
  "volume-up": async () => {
    await adjustWindowsVolume(175, 5);
    return "increasing volume";
  },
  "volume-down": async () => {
    await adjustWindowsVolume(174, 5);
    return "decreasing volume";
  },
  "volume-mute": async () => {
    await setWindowsMuted();
    return "toggling mute";
  },
  "volume-unmute": async () => {
    await setWindowsMuted();
    return "toggling mute";
  },
  "volume-max": async () => {
    await adjustWindowsVolume(175, 20);
    return "setting volume to maximum";
  },
  "volume-min": async () => {
    await adjustWindowsVolume(174, 20);
    return "setting volume to minimum";
  },
  "display-settings-open": async () => {
    await openWindowsUri("ms-settings:display");
    return "opening display settings";
  },
  "brightness-up": async () => {
    await adjustWindowsBrightness(10);
    return "increasing brightness";
  },
  "brightness-down": async () => {
    await adjustWindowsBrightness(-10);
    return "decreasing brightness";
  },
  "brightness-max": async () => {
    await setWindowsBrightness(100);
    return "setting brightness to maximum";
  },
  "brightness-min": async () => {
    await setWindowsBrightness(0);
    return "setting brightness to minimum";
  },
};

const getActionsForPlatform = () => {
  if (process.platform === "darwin") return macActions;
  if (process.platform === "win32") return windowsActions;
  return null;
};

export const isSystemActionType = (type) =>
  Object.hasOwn(macActions, type) || Object.hasOwn(windowsActions, type);

export const runSystemAction = async (type) => {
  const platformActions = getActionsForPlatform();

  if (!platformActions) {
    return {
      ok: false,
      response: "local system controls are currently supported only on mac and windows",
    };
  }

  const action = platformActions[type];
  if (!action) {
    return {
      ok: false,
      response: "that local system action is not supported yet",
    };
  }

  try {
    const response = await action();
    return {
      ok: true,
      response,
    };
  } catch (error) {
    if (type === "bluetooth-on" || type === "bluetooth-off") {
      if (process.platform === "darwin") {
        return {
          ok: false,
          response:
            error.message === "blueutil-missing"
              ? "i need blueutil installed to toggle bluetooth directly"
              : "i could not toggle bluetooth automatically",
        };
      }

      return {
        ok: false,
        response: "i could not toggle bluetooth automatically on windows",
      };
    }

    if (type === "wifi-on" || type === "wifi-off") {
      return {
        ok: false,
        response:
          process.platform === "win32"
            ? "i could not toggle wifi automatically on windows. try running the backend as administrator"
            : "i could not toggle wifi automatically",
      };
    }

    if (
      type === "volume-up" ||
      type === "volume-down" ||
      type === "volume-mute" ||
      type === "volume-unmute" ||
      type === "volume-max" ||
      type === "volume-min"
    ) {
      return {
        ok: false,
        response: "i could not control volume automatically",
      };
    }

    if (
      type === "brightness-up" ||
      type === "brightness-down" ||
      type === "brightness-max" ||
      type === "brightness-min"
    ) {
      return {
        ok: false,
        response:
          process.platform === "win32"
            ? "i could not control brightness automatically on windows"
            : "i could not control brightness automatically",
      };
    }

    return {
      ok: false,
      response: "i could not open that system setting",
    };
  }
};
