const { remote } = require('electron');
const spotify = remote.getGlobal('spotify');
const authenticate = remote.getGlobal('authenticate');
const ipc = require('electron').ipcRenderer;

const ElectronTitlebarWindows = require('electron-titlebar-windows');


const titlebar = new ElectronTitlebarWindows({ draggable: true });



let currentNotification

let poller = null

const updateStatus = (status, noToast) => {
    const titleArtist = `${status.title} - ${status.artist}`
    const display = `<h2>${titleArtist}</h2><p>Volume: ${status.volume}%</p>`
    document.getElementById('status').innerHTML = `${display}`
    document.title = titleArtist
    if (!noToast && currentNotification)
        currentNotification.close()
    if (!noToast) {
        currentNotification = new Notification(status.isPlaying ? 'Playing:' : 'Paused:', {
            body: titleArtist
        })
    }
}

const pollSpotify = (interval) => {
    // do status polling every X seconds or so
    interval = interval || 10000
    return setInterval(() => {
        // eat error > console
        spotify.status().then((status) => {
            updateStatus(status, true)
            console.log('poller', status)
        }).catch((err) => console.error(err))
    }, interval)
}

document.body.addEventListener('click', (event) => {
    // todo check for relevant ID?
    if (event.target.dataset.controls)
        handleControls(event.target.dataset.controls)

    if (event.target.dataset.playId)
        spotify.playItem(event.target.dataset.playId)

    if (event.target.dataset.deviceId) {
        spotify.initDevice(event.target.dataset.deviceId).then((activeDevice) => {
            if (currentNotification)
                currentNotification.close()
            currentNotification = new Notification('Device activated: ' + activeDevice.name, {
                body: 'You can now start playing stuff'
            })
        })
    }
})


const handleControls = (status) => {
    switch (status) {
        case 'playPause':
            spotify.playPause().then((status) => {
                updateStatus(status)
                console.log(status)
            }).catch((err) => console.error(err))
            break;
        case 'next':
            spotify.next().then((status) => {
                updateStatus(status)
            })
            break;
        case 'authenticate':
            authenticate()
            break;
        case 'previous':
            spotify.previous().then((status) => {
                updateStatus(status)
            })
            break;
        case 'volumeUp':
            spotify.volumeUp().then((status) => {
                updateStatus(status, true)
            })
            break;
        case 'volumeDown':
            spotify.volumeDown().then((status) => {
                updateStatus(status, true)
            })
            break;
        case 'getActiveDevice':
            spotify.getDeviceInfo().then((deviceInfo) => {
                let list = document.createElement('ul')
                deviceInfo.devices.forEach(element => {
                    let listItem = document.createElement('li')
                    listItem.innerHTML = '<a href="#" data-device-id="' + element.id + '"> Activate: ' + element.name + '</a> Type: ' + element.type
                    list.appendChild(listItem)
                });
                document.querySelector("#devices").appendChild(list)
            })
            break;
        case 'status':
            if (poller !== null) {
                clearInterval(poller)
                poller = null
            }
            else {
                poller = pollSpotify()
            }
            break;
        case 'getPlayLists':
            spotify.getPlayLists().then((playlists) => {
                let list = document.createElement('ul')
                playlists.items.forEach(element => {
                    let listItem = document.createElement('li')
                    listItem.innerHTML = '<a href="#" data-play-id="' + element.uri + '">' + element.name + '</a>'
                    list.appendChild(listItem)
                });
                document.querySelector("#playlists").appendChild(list)
                updateStatus(status, true)
            })
            break;
    }
}

console.log('hooking controls event')
ipc.on('controls', function (event, arg) {
    handleControls(arg)
})

ipc.on('status', function (event, arg) {
    updateStatus(arg, true)
})

ipc.on('ready', function (event) {
    // TODO hook up titlebar properly
    // titlebar.appendTo(document.body)
})

titlebar.on('close', function (e) {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});