const iohook = require('iohook')
const express = require('express')
const request = require('request-promise');
const webpush = require('web-push');

const app = express()
app.use(require('body-parser').json())

const port = 3000
const host = 'localhost'

const scopes = 'user-read-private user-read-email user-read-playback-state user-modify-playback-state'
const clientId = '327ef12ab5404e81aae02412ad0c577d' //process.env.CLIENT_ID
const clientSecret = 'a4e7d9db8b6f407aa19379b283feba55' //process.env.CLIENT_SECRET
const redirectUri = `http://${host}:${port}/authorized`

const publicVapidKey = 'BNyD-UAKEpgzWZzvZjDLw4x-_v6YMFbLF2chNhR6LvjUZdLtycWHRCBhqJwMpFZGy50VKKVloxF_1xiXCBb2D-8' //process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = 'm_8WVrkx1-c6jPLWNQ30JyKf4ztaLCKEI4pa6xZMyfk' //process.env.PRIVATE_VAPID_KEY;

webpush.setVapidDetails('mailto:spoti-node@horinga.nl', publicVapidKey, privateVapidKey);

// https://developer.spotify.com/documentation/web-api/reference/player/

// TODO store nicer
const authorization = {
    token: '',
    refresh: '',
    expires: null
}

const updateAuth = (resp) => {
    authorization.token = resp.access_token
    authorization.refresh = resp.refresh_token
    const now = new Date()
    authorization.expires =new Date(now.getTime() + resp.expires_in*1000);
}

const refreshAuth = async (refreshToken) => {
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


const getToken = () => {
    if (authorization.expires) {
        if (new Date() < authorization.expires) {
            return authorization.token
        }
        else {
            refreshAuth(authorization.refresh)
        }
    }
    throw new Error("no token found yet")
}


app.get('/login', (req, res) => {
    res.redirect('https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + clientId +
        (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
        '&redirect_uri=' + encodeURIComponent(redirectUri))
})

app.get('/authorized', async (req, res) => {
    if (req.query.error) {
        console.error(req.query.error)
        res.send('Error! ' + req.query.error)
    }
    else {
        // now get the actual token
        try {
            const resp = await request({
                'uri': 'https://accounts.spotify.com/api/token',
                'method': 'POST',
                'resolveWithFullResponse': true,
                form: {
                    'grant_type': 'authorization_code',
                    'code': req.query.code,
                    'redirect_uri': redirectUri,
                    'client_id': clientId,
                    'client_secret': clientSecret
                }
            })
            console.log('get_authorization', resp)
            updateAuth(JSON.parse(resp.body))
        }
        catch (err) {
            console.error(err)
        }
        res.send('Yep, it worked! <a href="/login">again</a>')
    }
})

let sub

app.post('/subscribe', (req, res) => {
  const subscription = req.body
  res.status(201).json({})
  const payload = JSON.stringify({ title: 'test' })

  console.log(subscription)
  sub = subscription
  webpush.sendNotification(subscription, payload).catch(error => {
    console.error(error.stack)
  })
})

app.use(require('express-static')('./'))


app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
    iohook.start();
})

const isPlaying = async () => {
    try {
        const resp = await request.get('https://api.spotify.com/v1/me/player').auth(null, null, true, getToken())
        const jsonResponse = JSON.parse(resp)
        console.log(jsonResponse)


        return jsonResponse.is_playing
    }
    catch(err) {
        console.error(err)
        return false
    }
    
}

iohook.on('keydown', async (e) => {
    switch (e.rawcode) {
        case 178:
            // stop
            console.log('stop')
            break;
        case 177:
            // previous
            console.log('prev')
            break;
        case 176:
            // next
            
            const resp = await request.post('https://api.spotify.com/v1/me/player/next').auth(null, null, true, getToken())
            console.log('next', resp)
            webpush.sendNotification(sub, JSON.stringify({title:'next'})).catch(error => {
               console.error(error.stack);
            });

            break;
        case 179:
            // play/pause
            const plays = await isPlaying()
            if(plays) {
                const resp = await request.put('https://api.spotify.com/v1/me/player/pause').auth(null, null, true, getToken())
                console.log('pause', resp)
                webpush.sendNotification(sub, JSON.stringify({title:'pause'})).catch(error => {
                    console.error(error.stack);
                 });
     
            }
            else {
                const resp = await request.put('https://api.spotify.com/v1/me/player/play').auth(null, null, true, getToken())
                console.log('play', resp)
                webpush.sendNotification(sub,  JSON.stringify({title:'play'})).catch(error => {
                    console.error(error.stack);
                 });
     
            }

            break;
        case 173:
            // mute
            console.log('vol mute')
            break;
        case 174:
            // volume up
            console.log('vol up')
            break;
        case 175:
            // volume down
            console.log('vol down')
            break;


        default:
            break;
    }
})

