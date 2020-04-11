require('dotenv').config();

const axios = require('axios');
const buffer = require('buffer');
const crypto = require('crypto');
const express = require('express');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const LTI = require('ltijs').Provider;

const users = {};
const teams = {};
const channels = {};

const grants = {};
const tokenKey = Buffer.from(crypto.randomBytes(32));

function encryptToken(obj) {
    const iv = Buffer.from(crypto.randomBytes(16));
    const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey, iv);

    let enc = cipher.update(JSON.stringify(obj), 'utf8', 'hex');
    enc += cipher.final('hex');

    return enc + '.' + iv.toString('hex') + '.' + cipher.getAuthTag().toString('hex');
};

function decryptToken(token) {
    let [enc, iv, authTag] = token.split('.', 3);

    iv = Buffer.from(iv, 'hex');
    authTag = Buffer.from(authTag, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey, iv);
    decipher.setAuthTag(authTag);
    let str = decipher.update(enc, 'hex', 'utf8');
    str += decipher.final('utf8');

    return JSON.parse(str);
};

function getAccessToken(token) {
    return {
        access_token: token,
        token_type: 'bearer',
        expires_in: 7200,
        refresh_token: token 
    };
}

function sleep(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
}

const urls = [];
const lti = new LTI(process.env.LTI_KEY, {
    url: 'mongodb://' + process.env.DB_HOST + '/' + process.env.DB_DATABASE,
    connection: {
        user: process.env.DB_USER,
        pass: process.env.DB_PASS
    }
}, {
    appUrl: '/app',
    serverAddon: (app) => {
        app.use(async (req, res, next) => {
            if (req.path === '/login') {
                req.body.iss += '/' + req.body.lti_message_hint;
            } else if (req.path === '/app') {
                const validationInfo = await lti.Database.Get(false, 'validation', { state: req.body.state });
                if (validationInfo.length > 0) {
                    urls.push(validationInfo[0].iss);
                }
                await lti.Database.Modify(false, 'validation', { state: req.body.state }, { iss: process.env.PLATFORM_URL });
            }

            next();
        });
    }
});

const oldGetPlatform = lti.getPlatform;
lti.getPlatform = (url, ENCRYPTIONKEY, logger, Database) => {
    if (urls.length > 0) {
        url = urls.shift();
    }

    return oldGetPlatform.call(lti, url, ENCRYPTIONKEY, logger, Database);
};

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

app.get('/oauth/authorize', (req, res) => {
    if (req.query.response_type === 'code') {
        const code = crypto.randomFillSync(Buffer.alloc(128/8)).toString('base64');
        grants[code] = req.cookies['MM_LTI_TOKEN'];

        const params = { code: code };

        if (req.query.state) {
            params['state'] = req.query.state;
        }

        res.writeHead(303, { Location: req.query.redirect_uri + '?' + querystring.stringify(params) });
        res.end();
    } else {
        res.writeHead(400);
        return res.end('invalid response_type requested');
    }
});

app.post('/oauth/token', (req, res) => {
    const id = req.body.client_id;
    const secret = req.body.client_secret;
    const code = req.body.code;

    if(req.body.grant_type === 'authorization_code' && id === process.env.OAUTH_ID && secret === process.env.OAUTH_SECRET && code in grants) {
        res.json(getAccessToken(grants[code]));
        delete grants[code];
    } else {
        res.writeHead(400);
        res.end('no such grant found');
    }
});

app.get('/api/v4/user', (req, res) => res.json(decryptToken(req.headers.authorization.split(' ', 2)[1])));


(async () => {
    axios.defaults.baseURL = process.env.MATTERMOST_API;
    axios.defaults.headers.common = { 'Authorization': `Bearer ${process.env.MATTERMOST_TOKEN}` };

    while (true) {
        try {
            {
                const req = await axios.get('/teams');
                for (const team of req.data) {
                    teams[team.name] = team;
                }

                if (!('moodle' in teams)) {
                    teams.moodle = (await axios.post('/teams', {
                        name: 'moodle',
                        display_name: 'Moodle Mattermost',
                        type: 'O'
                    })).data;
                }
            }

            {
                const req = await axios.get('/users');
                for (const user of req.data) {
                    users[user.username] = user;
                }
            }

            {
                const req = await axios.get(`/channels`);
                for (const channel of req.data) {
                    if (channel.team_id === teams.moodle.id) {
                        channels[channel.name] = channel;
                    }
                }
            }
            break;
        } catch(e) {
            console.log('Retrieving Mattermost API access failed', e.response ? (e.response.status + ' ' + e.response.statusText) : '');
            await sleep(2000);
        }
    }

    // Deploy and open connection to the database
    await lti.deploy({ port: process.env.LTI_PORT, silent: false });

    // Register platforms
    for (const platform of process.env.PLATFORMS.split(':')) {
        const [courseId, clientId] = platform.split('|', 2);
        const plat = await lti.registerPlatform({
            url: process.env.PLATFORM_URL + '/' + courseId,
            name: process.env.PLATFORM_NAME,
            clientId: clientId,
            authenticationEndpoint: process.env.PLATFORM_AUTH_URL,
            accesstokenEndpoint: process.env.PLATFORM_TOKEN_URL,
            authConfig: { method: 'JWK_SET', key: process.env.PLATFORM_KEY_URL }
        });

        // Get the public key generated for that platform
        console.log('registered platform', clientId, '\n', await plat.platformPublicKey(), '\n\n');
    }

    // Set connection callback
    lti.onConnect(async (connection, request, response) => {
        const courseId = response.locals.context.context.label.toLowerCase().replace(/\./g, '');
        const courseName = response.locals.context.context.title;

        const userId = response.locals.token.user;
        const userMail = response.locals.token.userInfo.email;
        const userName = response.locals.token.userInfo.email.split('@', 2)[0];

        if (!(courseId in channels)) {
            try {
                const channel = await axios.post('/channels', {
                    team_id: teams.moodle.id,
                    name: courseId,
                    display_name: courseName,
                    purpose: `Mattermost Channel für den '${courseName}' Moodle-Kurs`,
                    type: 'P'
                });
                channels[channel.data.name] = channel.data;
            } catch {
                console.error('Could not create channel', courseId, courseName);
            }
        }

        if (!(userName in users)) {
            try {
                const user = await axios.post('/users', {
                    email: userMail,
                    username: userName,
                    first_name: response.locals.token.userInfo.given_name,
                    last_name: response.locals.token.userInfo.family_name,
                    auth_data: userId,
                    auth_service: 'gitlab'
                });
                users[user.data.username] = user.data;
                await axios.post(`/teams/${teams.moodle.id}/members`, {
                    team_id: teams.moodle.id,
                    user_id: users[userName].id
                });
            } catch(e) {
                console.error('Could not create user', userName, e.response.status, e.response.statusText);
            }
        }
        
        try {
            await axios.post(`/channels/${channels[courseId].id}/members`, {
                user_id: users[userName].id
            });
        } catch(e) {
            console.error('Could not add user to channel', userName, channels[courseId].id, e.response.status, e.response.statusText);
        }

        const mmUser = {
            id: parseInt(userId, 10),
            name: response.locals.token.userInfo.name,
            displayName: response.locals.token.userInfo.name,
            username: userName,
            email: userMail
        };
        response.cookie('MM_LTI_TOKEN', encryptToken(mmUser));
        lti.redirect(response, '/oauth/gitlab/login');
    }, { secure: true });

    lti.app.get('/main', (req, res) => res.send('It\'s alive!'));
})();

app.listen(process.env.OAUTH_PORT, () => console.log(`Auth bridge listening at http://localhost:${process.env.OAUTH_PORT}`));
