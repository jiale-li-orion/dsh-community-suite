# Meshfin desktop launcher

English | [中文](README.zh.md)

The plumbing that turns "there is a server somewhere" into a double-click: the desktop shortcut, the launcher that opens the browser only once the port answers, the WSL-side lifetime owner, and an optional desktop tile.

Both portable distributions carry this directory as their `desktop/` folder, so a reader who extracts an archive can set up a desktop entry without cloning anything.

## Windows

Run `windows/setup.cmd` once. It creates a **Meshfin Web** shortcut on the desktop, with this distribution's icon, pointing at the launcher. Add `--tile` to also build and start the desktop tile.

| File | What it does |
| --- | --- |
| `windows/setup.cmd` | Creates the desktop shortcut; `--tile` also builds and starts the tile. |
| `windows/start-meshfin.cmd` | Starts the harness and opens the browser once the port accepts connections. Takes an optional port; `MESHFIN_NO_BROWSER=1` skips the browser. |
| `windows/open-when-ready.ps1` | Polls the port, then opens the default browser. A tab never lands on a dead page. |
| `windows/meshfin.ico` | The shortcut and tile icon. |
| `windows/tile/` | The desktop tile: `MeshfinTile.cs`, `build-tile.cmd`, `start-tile.cmd`, `stop-tile.cmd`, `meshfin-tile.ini.example`, and `skins/`. |

### Lifetime

One console window is the server's lifetime, which is what makes "close the browser, keep working" true:

- closing the browser window leaves the server running;
- closing the console window stops it;
- `Ctrl+C` in the console stops it.

## WSL and Linux

`wsl/meshfin-web.sh` is the same lifetime owner for a WSL or Linux desktop. It resolves the harness in this order: `MESHFIN_CMD`, then the `meshfin` launcher two directories up, then a `dsh` on `PATH`. It serves the port it resolved (`DSH_WEB_PORT`, default 3080) and opens the browser once that port answers.

```sh
./desktop/wsl/meshfin-web.sh            # serve on 3080
DSH_WEB_PORT=8080 ./desktop/wsl/meshfin-web.sh
```

`linux/install-desktop-entry.sh` writes a `meshfin-web.desktop` entry into the applications directory so the launcher appears in the desktop's application menu. It generates absolute paths, which is why it runs after extraction instead of shipping a fixed file.

## The desktop tile

`windows/tile/MeshfinTile.cs` is a Win32 layered window that behaves like part of the wallpaper: per-pixel transparency, no taskbar button, no focus stealing, and a click that starts the harness. It is compiled from source by `build-tile.cmd` with the `csc.exe` every Windows install already has — no SDK and no package manager.

`skins/` ships four default skins, downscaled from their originals so the repository stays light. Right-click the tile to change skin, size, or position; the choice is remembered in `meshfin-tile.ini` beside the executable.

The tile can also draw a DeepSeek balance chip. That needs a snapshot file and a fetcher, configured in `meshfin-tile.ini`; without them the tile simply draws the skin, because the balance is a personal deployment detail and not part of this project.
