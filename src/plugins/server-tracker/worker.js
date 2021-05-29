const { parentPort } = require('worker_threads');
const got = require('got');
const { parse } = require('node-html-parser');

async function doFetch(meta) {
    const ts = Math.floor(Date.now() / 1000);

    console.time('fetching');
    const res = await got(`https://dstserverlist.appspot.com/ajax/list?${ts}`, {
        searchParams: {
            [meta.CSRF_KEY]: meta.CSRF_VALUE
        },
        headers: {
            'Cookie': meta.COOKIE,
            'Referer': 'https://dstserverlist.appspot.com/',
            'x-requested-with': 'XMLHttpRequest'
        }
    }).json();
    console.timeEnd('fetching');

    console.time('parsing');
    const document = parse(res.result);
    console.timeEnd('parsing');

    console.time('deserializing');
    const servers = document.querySelectorAll('.list > tr').map(row => {
        // Highly optimized implementation to avoid querySelectors
        // View older commits to find a more understandable version

        // Id is used to fetch more data about the server if the name matches
        const id = row.getAttribute('id');

        // firstData contains server type, flag, country, name, and icons
        const firstData = row.childNodes[0];

        // platformData contains the platform the server hosts for
        const platformData = row.childNodes[1];

        // playerData contains player info and a lock if it's passworded
        const playerData = row.childNodes[2];

        // modeData contains just a single text node with endless/survival
        const modeData = row.childNodes[3];

        // seasonData contains the current season
        const seasonData = row.childNodes[4];

        // Get name
        const name = firstData.childNodes[2].firstChild.text;

        // Get country name and code
        const flag = firstData.childNodes[1];
        const country = flag.getAttribute('data-tooltip');
        const countryClass = flag.getAttribute('class');
        const countryCodeDashIndex = countryClass.lastIndexOf('-');
        const countryCode = countryClass.slice(countryCodeDashIndex + 1);

        // Get platform: Steam, WeGame, PS4, more?
        const platform = platformData.firstChild.text;

        // Get player count, fpy is also used to check for password
        const playersText = playerData.firstChild.text;
        const index = playersText.indexOf('/');
        const playerCount = Number(playersText.slice(0, index));
        const maxPlayers = Number(playersText.slice(index + 1));

        // Get gamemode (normal/endless) and current season
        const mode = modeData.firstChild.text;
        const season = seasonData.firstChild.text;

        // Get some flags: modded, outdated, pvp, official, passworded
        const icons = firstData.childNodes.slice(4);
        const modded = icons.some(icon => icon.text === 'settings');
        const outdated = icons.some(icon => icon.text === 'warning');
        const pvp = icons.some(icon => icon.text === 'restaurant_menu');
        const official = icons.some(icon => icon.text === 'check_circle');

        // Player count can have a lock icon if it's passworded
        const passworded = playerData.childNodes.length === 2;

        return {
            id,
            country,
            countryCode,
            platform,
            playerCount,
            maxPlayers,
            name,
            mode,
            season,
            modded,
            outdated,
            pvp,
            official,
            passworded
        };
    });
    console.timeEnd('deserializing');

    return servers;
    parentPort.postMessage(servers);
}

parentPort.on('message', async data => {
    switch (data.type) {
        case 'fetch':
            try {
                const servers = doFetch(data.payload.meta);

                parentPort.postMessage({
                    kind: 'success',
                    payload: servers
                });
            } catch(e) {
                parentPort.postMessage({
                    kind: 'error',
                    error: e
                });
            }
            break;
    }
});
