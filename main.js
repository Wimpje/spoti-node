const electron = require('electron')
const spotify = require('./spotify')


const { app, BrowserWindow, globalShortcut } = electron

function createWindow() {
    // Create the browser window.
    const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize
    win = new BrowserWindow({ frame: false, width: width - 150, height: height - 150 })

    // and load the index.html of the app.
    win.loadFile('index.html')
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
    win.webContents.once('dom-ready', () => {
        win.webContents.send("ready", true)
    });

    console.log('app ready from stuff')

    const registerControlsHotkey = (key, control) => {
        const registered = globalShortcut.register(key, () => {
            win.webContents.send("controls", control)
        })
        console.log((registered ? 'Registered: ' : 'DID NOT register: ') + key)
    }

    // TODO why does playpause not work?
    registerControlsHotkey('MediaPlayPause', 'playPause')
    registerControlsHotkey('MediaStop', 'playPause')
    registerControlsHotkey('MediaPreviousTrack', 'previous')
    registerControlsHotkey('MediaNextTrack', 'next')
    registerControlsHotkey('VolumeUp', 'volumeUp')
    registerControlsHotkey('VolumeDown', 'volumeDown')

    return win
}

const authenticate = (mainWindow) => {
    var authWindow = new BrowserWindow({ width: 200, height: 100, show: false, frame: false, webPreferences: { 'nodeIntegration': false } });
    authWindow.loadURL(spotify.createRedirectUri());
    authWindow.show();
    authWindow.webContents.on('will-navigate', function (event, url) {
        console.log('will-navigate: ' + url, event)
        spotify.handleCallback(url, authWindow).then((status) => {
            mainWindow.webContents.send('status', status)
        })

    });

    authWindow.webContents.on('crashed', () => {
        console.log('crashed')
    })
    authWindow.webContents.on('did-finish-load', () => {
        let currentURL = authWindow.webContents.getURL()
        console.log('did-finish-load: ' + currentURL)

        spotify.handleCallback(currentURL, authWindow).then((status) => {
            mainWindow.webContents.send('status', status)
        })

    })
    authWindow.webContents.on('did-get-redirect-request', function (event, oldUrl, newUrl) {
        console.log('did-get-redirect: ' + newUrl, event)
        spotify.handleCallback(newUrl, authWindow).then((status) => {
            mainWindow.webContents.send('status', status)
        })
    });

    authWindow.on('close', () => {
        console.log('closed')
        authWindow = null;
    }, false);
}


app.on('ready', () => {
    const mainWindow = createWindow()
    authenticate(mainWindow)
})



// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})

global.spotify = spotify
global.authenticate = authenticate