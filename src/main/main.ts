import "reflect-metadata";
import { app, BrowserWindow, Tray, Menu, nativeTheme } from "electron";
import * as path from "path";
import * as url from "url";
import { FileSystem } from "@server/fileSystem";

import { Server } from "@server/index";
import { UpdateService, FCMService } from "@server/services";

let win: BrowserWindow | null;
let tray: Tray | null;
let api = Server(win);

// Start the API
api.start();

const handleExit = async () => {
    if (!api) return;

    Server().log("Stopping all services...");

    if (api.ngrok) await api.ngrok.stop();
    if (api.socket?.server) api.socket.server.close();
    if (api.iMessageRepo?.db && api.iMessageRepo.db.isConnected) await api.iMessageRepo.db.close();
    if (api.repo?.db && api.repo.db.isConnected) await api.repo.db.close();
    if (api.fcm) FCMService.stop();
    if (api.caffeinate && api.caffeinate.isCaffeinated) api.caffeinate.stop();

    app.quit();
};

const buildTray = () => {
    return Menu.buildFromTemplate([
        {
            label: "BlueBubbles Server",
            enabled: false
        },
        {
            label: "Open",
            type: "normal",
            click: () => {
                if (win) {
                    win.show();
                } else {
                    createWindow();
                }
            }
        },
        {
            label: "Restart",
            type: "normal",
            click: () => {
                app.relaunch({ args: process.argv.slice(1).concat(["--relaunch"]) });
                app.exit(0);
            }
        },
        {
            type: "separator"
        },
        {
            label: `Server Address: ${api.repo.getConfig("server_address")}`,
            enabled: false
        },
        {
            label: `Socket Connections: ${api.socket?.server.sockets.sockets.length ?? 0}`,
            enabled: false
        },
        {
            label: `Caffeinated: ${api.caffeinate?.isCaffeinated}`,
            enabled: false
        },
        {
            type: "separator"
        },
        {
            label: "Close",
            type: "normal",
            click: async () => {
                await handleExit();
            }
        }
    ]);
};

const createTray = () => {
    let iconPath = path.join(FileSystem.resources, "macos", "tray-icon-dark.png");
    if (!nativeTheme.shouldUseDarkColors) iconPath = path.join(FileSystem.resources, "macos", "tray-icon-light.png");

    // If the tray is already created, just change the icon color
    if (tray) {
        tray.setImage(iconPath);
        return;
    }

    tray = new Tray(iconPath);
    tray.setToolTip("BlueBubbles");
    tray.setContextMenu(buildTray());

    // Rebuild the tray each time it's clicked
    tray.on("click", () => {
        tray.setContextMenu(buildTray());
    });
};

const createWindow = async () => {
    win = new BrowserWindow({
        title: "BlueBubbles Server",
        useContentSize: true,
        width: 1080,
        height: 1030,
        webPreferences: {
            nodeIntegration: true // Required in new electron version
        }
    });

    if (process.env.NODE_ENV !== "production") {
        process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "1"; // eslint-disable-line require-atomic-updates
        win.loadURL(`http://localhost:2003`);
    } else {
        win.loadURL(
            url.format({
                pathname: path.join(__dirname, "index.html"),
                protocol: "file:",
                slashes: true
            })
        );
    }

    if (process.env.NODE_ENV !== "production") {
        // Open DevTools, see https://github.com/electron/electron/issues/12438 for why we wait for dom-ready
        win.webContents.once("dom-ready", () => {
            win!.webContents.openDevTools();
        });
    }

    win.on("closed", () => {
        win = null;
    });

    // Prevent the title from being changed from BlueBubbles
    win.on("page-title-updated", evt => {
        evt.preventDefault();
    });

    // Hook onto when we load the UI
    win.webContents.send("config-update", api.repo.config);
    win.webContents.on("dom-ready", async () => {
        win.webContents.send("config-update", api.repo.config);
    });

    // Set the new window in the API
    api = Server(win);

    // Start the update service
    const updateService = new UpdateService();
    updateService.start();
    updateService.checkForUpdate();
};

app.on("ready", () => {
    createTray();
    createWindow();

    nativeTheme.on("updated", () => {
        createTray();
    });
});

app.on("window-all-closed", async () => {
    if (process.platform !== "darwin") {
        await handleExit();
    }
});

app.on("activate", () => {
    if (win === null) {
        createWindow();
    }
});

/**
 * I'm not totally sure this will work because of the way electron is...
 * But, I'm going to try.
 */
app.on("before-quit", async _ => {
    await handleExit();
});
