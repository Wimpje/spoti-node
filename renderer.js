const { remote } = require('electron');
const spotify = remote.getGlobal('spotify');
const authenticate = remote.getGlobal('authenticate');
const ipc = require('electron').ipcRenderer;

const ElectronTitlebarWindows = require('electron-titlebar-windows');
const titlebar = new ElectronTitlebarWindows({ draggable: true });

let currentNotification
let currentlyPlaying
let isCurrentlyPlaying
let poller = null

const rawJsonFormatterFilter = (key, value) => {
    if(key === 'available_markets')
        return '[omitted]'

    return value
}

const updateStatus = async (status, noToast) => {
    if(!status)
        status = await spotify.status()

    let titleArtist = `${status.title} - ${status.artist}`
    noToast = (noToast || currentlyPlaying === titleArtist) 
    
    document.getElementById('rawstatus').innerHTML = `Last update: ${new Date().toLocaleTimeString()}</br><pre>${JSON.stringify(spotify.currentStatus().json, rawJsonFormatterFilter, 2)}</pre>` 
    titleArtist = currentlyPlaying = `${status.title} - ${status.artist}`
    const currentDevice = spotify.getCurrentDevice()
    let img = ''
    // maybe make a joi scheme or something for the response?
    if(status.json && 'item' in status.json && 'album' in status.json.item && 'images' in status.json.item.album)
        img = status.json.item.album.images.length ? `<img src="${status.json.item.album.images[0].url}" id="album-art">` : ''
    const display = `<h2>${titleArtist}</h2><p>Volume: ${status.volume}%</p><p>Playing on: ${currentDevice}</p>${img}`
    document.getElementById('status').innerHTML = `${display}`
    document.title = (status.isPlaying ? '' : 'Paused: ') + titleArtist + (poller !== null ? '*' : '')
    
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
    updateStatus()
    return setInterval(() => {
        updateStatus()
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
                // this is not a nice place to do this, but it's convenient for now. Fixed when state is managed properly
                if (!status.isPlaying && poller !== null) {
                    clearInterval(poller)
                    poller = null
                }
                else {
                    poller = pollSpotify()
                }
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
        case 'saveTrack':
            spotify.status().then((status) => {
                spotify.saveTrack(status.item.id).then((res) => {
                    if (currentNotification)
                        currentNotification.close()
                    currentNotification = new Notification('Save track:', {
                        body: `${res}: ${status.title} - ${status.artist}`
                    })
                })
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
    
    // this is not a nice place to do this, but it's convenient for now. Fixed when state is managed properly, u
    if (poller === null) {
        poller = pollSpotify()
    }
})

titlebar.on('close', function (e) {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});