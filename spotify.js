const request = require('request-promise');
const sleep = require('util').promisify(setTimeout)
const config = require('./config.js')

// https://developer.spotify.com/documentation/web-api/reference/player/
const host = 'localhost'

const scopes = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative'
const clientId = config.get('spotifyClientID')
const clientSecret = config.get('spotifyClientSecret')
const redirectUri = `https://${host}/callback`
let device_id = ''
let device_name = ''

let currentStatus = {
    isPlaying: false,
    volume: 50,
    title: '',
    artist: '',
    json: {}
}

// TODO store nicer
const authorization = {
    token: '',
    refresh: '',
    expires: null
}

const updateAuth = (resp) => {
    console.log('updateAuth', resp)
    authorization.token = resp.access_token
    if (resp.refresh_token)
        authorization.refresh = resp.refresh_token
    else
        console.log('no refresh_token provided, keep using the same one')
    const now = new Date()
    authorization.expires = new Date(now.getTime() + resp.expires_in * 1000);
}

const refreshAuth = async (refreshToken) => {
    try {
        const resp = await request({
            'uri': 'https://accounts.spotify.com/api/token',
            'method': 'POST',
            resolveWithFullResponse: true,
            form: {
                'grant_type': 'refresh_token',
                'refresh_token': refreshToken,
                'client_id': clientId,
                'client_secret': clientSecret
            }
        })
        console.log('refresh', resp)
        updateAuth(JSON.parse(resp.body))
    }
    catch (err) {
        console.error(err)
    }
}


const getToken = (forceRefresh) => {
    if (authorization.expires) {
        if (!forceRefresh && new Date() < authorization.expires) {
            return authorization.token
        }
        else {
            refreshAuth(authorization.refresh)
        }
    }
    throw new Error("no token found yet")
}

const createRedirectUri = () => {
    return 'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + clientId +
        (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
        '&redirect_uri=' + encodeURIComponent(redirectUri)
}

// was redirect from callback
const handleCallback = async (redirectUrl, window) => {
    console.log(redirectUrl)
    var raw_code = /code=([^&]*)/.exec(redirectUrl) || null;
    var code = (raw_code && raw_code.length > 1) ? raw_code[1] : null;
    var error = /\?error=(.+)$/.exec(redirectUrl);

    if (code || error) {
        // Close the browser if code found or error
        window.destroy();
    }

    if (code) {

        const resp = await request({
            'uri': 'https://accounts.spotify.com/api/token',
            'method': 'POST',
            'resolveWithFullResponse': true,
            form: {
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirectUri,
                'client_id': clientId,
                'client_secret': clientSecret
            }
        })
        updateAuth(JSON.parse(resp.body))
        // start refreshing every 30? minutes
        tokenRefresher()
        // make sure at least one device is active
        await initDevice()
        return await status()
    }
    else {
        console.error('something went wrong handling the callback:' + error)
        return await status()
    }
}

const spotifyApiRequestAsync = async (url, method, body) => {
    let requestObj = { url: url, method: method }
    if (body) {
        requestObj.body = JSON.stringify(body)
    }
    try {
        const resp = await request(requestObj).auth(null, null, true, getToken())
        if (resp === '')
            return resp
        const jsonResponse = JSON.parse(resp)
        console.log(url, jsonResponse)
        return jsonResponse
    }
    catch (err) {
        console.error(err)
        console.info('Will just retry getting token')
        // check on refreshtoken expired, otherwise throw. For now just return the request again
        return await request(requestObj).auth(null, null, true, getToken(true))
    }
}

const updateCurrentStatus = (newStatus) => {
    currentStatus = newStatus

    return currentStatus
}

const status = async () => {
    try {
        const jsonResponse = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player?device_id=' + device_id, 'GET')

        if (jsonResponse) {
            return updateCurrentStatus({
                isPlaying: jsonResponse.is_playing,
                volume: jsonResponse.device.volume_percent,
                title: jsonResponse.item.name,
                artist: jsonResponse.item.artists.map((artist) => { return artist.name }).join(', '),
                json: jsonResponse
            })
        }
        else {
            console.log('no response for status request, returning empty object')
            return updateCurrentStatus({
                isPlaying: false,
                volume: 50,
                title: '',
                artist: '',
                json: {}
            })
        }

    }
    catch (err) {
        console.error(err)
        return {
            isPlaying: false,
            volume: 0,
            error: err.message
        }
    }
}

const next = async () => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/next?device_id=' + device_id, 'POST')
    console.log('next', resp)
    await sleep(1000)
    return await status()
}

const previous = async () => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/previous?device_id=' + device_id, 'POST')
    console.log('previous', resp)
    await sleep(1000)
    return await status()
}

const saveTrack = async (trackId) => {
    if (!trackId)
        throw new Error('No track id provided')

    try {
        const resp = await spotifyApiRequestAsync(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackId}`, 'GET')
        console.log('saved track contains? ', resp)
        if (Array.isArray(resp) && Array.isArray[0] === 'false') {
            resp = await spotifyApiRequestAsync(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, 'PUT')
            console.log('saved track resp:', resp)
            return 'Saved'
        }
        else {
            console.log('already in saved tracks')
            return 'Already saved'
        }
    }
    catch (err) {
        return err.message
    }
}

const volumeUp = async (percentage) => {
    percentage = percentage || 10
    const s = await status()
    console.log('volume' + s.volume)
    s.volume = Math.min(100, s.volume + percentage)
    volume(s.volume)
    return s
}

const volumeDown = async (percentage) => {
    percentage = percentage || 10
    const s = await status()
    console.log('volume' + s.volume)
    s.volume = Math.max(0, s.volume - percentage)
    volume(s.volume)
    return s
}

const volume = async (percentage) => {
    // use qs or something for queryestring, this is nasty
    if (typeof percentage !== 'undefined')
        percentage = `?volume_percent=${percentage}`
    else
        percentage = ''

    let device = ''
    if (percentage)
        device = '&device_id=' + device_id
    else
        device = '?device_id=' + device_id

    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/volume' + percentage + device, 'PUT')
    console.log('setvolume to' + percentage, resp)
    return resp
}

const play = async (s) => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/play?device_id=' + device_id, 'PUT')
    console.log('play', resp)
    s.isPlaying = true
    return updateCurrentStatus(s)
}

const playItem = async (item, s) => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/play?device_id=' + device_id, 'PUT', { context_uri: item })
    console.log('play item', item, resp)
    s.isPlaying = true
    return updateCurrentStatus(s)
}

const getPlayLists = async () => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/playlists', 'GET')
    console.log('getPlayLists', resp)
    return resp
}

const pause = async (s) => {
    const resp = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/pause?device_id=' + device_id, 'PUT')
    console.log('pause', resp)
    s.isPlaying = false
    return updateCurrentStatus(s)
}

const togglePlayPause = async () => {
    const s = await status()
    if (s.isPlaying) {
        return await pause(s)
    }
    else {
        return await play(s)
    }
}

const tokenRefresher = (interval) => {
    interval = interval || 30 * 1000 * 60 // 30 minutes
    return setInterval(() => {
        console.log('refreshing authorization, interval:', interval, authorization)
        refreshAuth(authorization.refresh).then((resp) => {
            console.log('refresh response:', resp)
        })
    }, interval)

}
const getDeviceInfo = async () => {
    const deviceInfo = await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player/devices', 'GET')
    return deviceInfo
}

const initDevice = async (id) => {
    // first determine there is an active player, if not, activate
    const deviceInfo = await getDeviceInfo()
    let device
    if (id)
        device = deviceInfo.devices.filter(d => d.id === id)
    else
        device = deviceInfo.devices.filter(d => d.is_active)

    console.log(id, deviceInfo)
    if (!device)
        throw new Error('device not found')

    device = device[0]

    device_id = device.id
    device_name = device.name
    // set volume to 50, as precaution?
    await volume(50)

    if (!device.is_active) {
        // this should activate the device...
        await spotifyApiRequestAsync('https://api.spotify.com/v1/me/player', 'PUT', { device_ids: [device_id] })

        console.log('activated?')
    }
    return device
}

const getCurrentDevice = () => {
    return device_name
}

module.exports.updateAuth = updateAuth
module.exports.getToken = getToken
module.exports.refreshAuth = refreshAuth
module.exports.createRedirectUri = createRedirectUri
module.exports.handleCallback = handleCallback
module.exports.playPause = togglePlayPause
module.exports.next = next
module.exports.previous = previous
module.exports.status = status
module.exports.volumeDown = volumeDown
module.exports.volumeUp = volumeUp
module.exports.getPlayLists = getPlayLists
module.exports.playItem = playItem
module.exports.initDevice = initDevice
module.exports.getDeviceInfo = getDeviceInfo
module.exports.getCurrentDevice = getCurrentDevice
module.exports.saveTrack = saveTrack
// this should be done differently I think
module.exports.currentStatus = () => {return currentStatus}

